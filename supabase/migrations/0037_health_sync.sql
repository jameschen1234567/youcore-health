-- 0037：iPhone「捷徑」自動同步步數、活動能量、安靜心率
-- 流程：會員在 App 產生同步碼 → 捷徑每天呼叫 rpc/health_sync（anon key ＋ 同步碼）→ 寫入 resting_hr / daily_activity
-- 安全：資料庫只存同步碼的 SHA-256；同步碼只能「寫入那一位會員的這 3 項」，不能讀任何資料。
-- 規則：會員才能用；步數／活動熱量只有 nutrition_enabled 的會員才存；只收 7 天內、非未來日期；超出範圍的欄位略過。

-- ── 資料來源（手填 / 自動） ─────────────────────────────────────────────────
alter table public.resting_hr add column source text not null default 'manual' check (source in ('manual', 'shortcut'));
alter table public.daily_activity add column source text not null default 'manual' check (source in ('manual', 'shortcut'));

-- ── 同步碼 ──────────────────────────────────────────────────────────────────
create table public.health_sync_tokens (
  profile_id    uuid primary key references public.profiles(id) on delete cascade,
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  last_sync_at  timestamptz
);
alter table public.health_sync_tokens enable row level security;
create policy health_sync_tokens_select on public.health_sync_tokens for select
  using (profile_id = auth.uid() or public.is_admin());
-- 前端只能讀時間欄位，看不到雜湊；新增／停用都走下面的函式
revoke all on public.health_sync_tokens from anon, authenticated;
grant select (profile_id, created_at, last_sync_at) on public.health_sync_tokens to authenticated;
grant all on public.health_sync_tokens to service_role;

create or replace function public.health_sync_hash(t text)
returns text language sql immutable as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;

-- 產生（或重新產生）自己的同步碼，回傳明碼一次；舊碼立即失效
create or replace function public.health_sync_issue()
returns text language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  if auth.uid() is null or not public.is_member() then raise exception '只有會員可以設定同步'; end if;
  tok := 'yc_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.health_sync_tokens (profile_id, token_hash) values (auth.uid(), public.health_sync_hash(tok))
  on conflict (profile_id) do update set token_hash = excluded.token_hash, created_at = now(), last_sync_at = null;
  return tok;
end $$;

-- 停用：自己，或管理員停用某位客人
create or replace function public.health_sync_revoke(target uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if target is not null and target is distinct from auth.uid() and not public.is_admin() then raise exception 'not allowed'; end if;
  delete from public.health_sync_tokens where profile_id = coalesce(target, auth.uid());
end $$;

-- 捷徑傳來的值可能是空字串、「8,123」或帶單位（「62 次/分」），一律收成數字；認不出來就當 null
create or replace function public.health_sync_num(v text)
returns int language plpgsql immutable as $$
declare t text := regexp_replace(coalesce(v, ''), '[^0-9.]', '', 'g');
begin
  if t !~ '^[0-9]+(\.[0-9]+)?$' then return null; end if;
  return round(t::numeric);
exception when others then return null;
end $$;

-- 捷徑呼叫：一次一天。參數都收文字（捷徑沒資料時會傳空字串）。
create or replace function public.health_sync(
  p_token text, p_day text, p_steps text default null, p_active_kcal text default null, p_rhr text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pid uuid; mem boolean; nut boolean; d date;
  s int := public.health_sync_num(p_steps); k int := public.health_sync_num(p_active_kcal); r int := public.health_sync_num(p_rhr);
  saved text[] := '{}';
begin
  begin d := substr(trim(p_day), 1, 10)::date; exception when others then d := null; end;
  select t.profile_id, p.member_no is not null, p.member_no is not null and p.nutrition_enabled
    into pid, mem, nut
    from public.health_sync_tokens t join public.profiles p on p.id = t.profile_id
   where t.token_hash = public.health_sync_hash(coalesce(p_token, ''));
  if pid is null then raise exception '同步碼無效，請到 App 重新產生'; end if;
  if not mem then raise exception '目前不是會員，無法同步'; end if;
  if d is null or d > public.taipei_today() or d < public.taipei_today() - 7 then
    raise exception '日期需在 7 天內（格式 yyyy-MM-dd）';
  end if;

  if r between 30 and 120 then
    insert into public.resting_hr (profile_id, measured_on, bpm, source) values (pid, d, r, 'shortcut')
    on conflict (profile_id, measured_on) do update set bpm = excluded.bpm, source = 'shortcut';
    saved := saved || 'rhr'::text;
  end if;

  if nut then
    if not (s between 0 and 100000) then s := null; end if;
    if not (k between 0 and 5000) then k := null; end if;
    if s is not null or k is not null then
      insert into public.daily_activity (profile_id, day, steps, active_kcal, source) values (pid, d, s, k, 'shortcut')
      on conflict (profile_id, day) do update set
        steps = coalesce(excluded.steps, daily_activity.steps),
        active_kcal = coalesce(excluded.active_kcal, daily_activity.active_kcal),
        source = 'shortcut';
      saved := saved || 'activity'::text;
    end if;
  end if;

  update public.health_sync_tokens set last_sync_at = now() where profile_id = pid;
  return jsonb_build_object('ok', true, 'day', d, 'saved', saved);
end $$;

revoke all on function public.health_sync(text, text, text, text, text) from public;
grant execute on function public.health_sync(text, text, text, text, text) to anon, authenticated;
revoke all on function public.health_sync_issue() from public, anon;
grant execute on function public.health_sync_issue() to authenticated;
revoke all on function public.health_sync_num(text) from public, anon, authenticated;
revoke all on function public.health_sync_hash(text) from public, anon, authenticated;
revoke all on function public.health_sync_revoke(uuid) from public, anon;
grant execute on function public.health_sync_revoke(uuid) to authenticated;
