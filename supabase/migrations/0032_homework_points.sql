-- 0032：回家作業＋打勾＋里程碑積分＋排行榜（會員限定：profiles.member_no 有值）
-- 設計：教練指派作業（期間＋目標天數＋點數）→ 客人每天打勾 → 打勾數達到目標時資料庫自動發點（每項作業只發一次）
-- 里程碑（第一次、過半、達成）由前端依打勾數計算顯示；點數只在「達成」時發。

create or replace function public.is_member(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = uid and member_no is not null) $$;

create or replace function public.taipei_today()
returns date language sql stable as $$ select (now() at time zone 'Asia/Taipei')::date $$;

-- ── 作業 ────────────────────────────────────────────────────────────────
create table public.homework (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 60),
  detail        text check (char_length(detail) <= 500),
  link          text check (link ~ '^https?://' and char_length(link) <= 500),
  starts_on     date not null,
  ends_on       date not null,
  target_days   int  not null check (target_days >= 1),
  points        int  not null default 10 check (points between 0 and 1000),
  archived      boolean not null default false,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 365),
  check (target_days <= ends_on - starts_on + 1)
);
create index homework_profile on public.homework (profile_id, ends_on);

-- ── 打勾（一項作業一天一次） ─────────────────────────────────────────────
create table public.homework_checkins (
  homework_id  uuid not null references public.homework(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  checked_on   date not null,
  created_at   timestamptz not null default now(),
  primary key (homework_id, checked_on)
);
create index homework_checkins_profile on public.homework_checkins (profile_id, checked_on);

-- ── 點數帳本（正數＝獲得、負數＝兌換扣點） ───────────────────────────────
create table public.points_ledger (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  amount       int  not null check (amount <> 0 and amount between -10000 and 10000),
  reason       text not null check (char_length(reason) between 1 and 100),
  homework_id  uuid unique references public.homework(id) on delete set null,  -- 每項作業最多發一次
  created_at   timestamptz not null default now()
);
create index points_ledger_profile on public.points_ledger (profile_id, created_at);

-- ── 權限 ────────────────────────────────────────────────────────────────
alter table public.homework          enable row level security;
alter table public.homework_checkins enable row level security;
alter table public.points_ledger     enable row level security;

create policy homework_select on public.homework for select using (profile_id = auth.uid() or public.is_admin());
create policy homework_admin  on public.homework for all using (public.is_admin()) with check (public.is_admin());

create policy checkins_select on public.homework_checkins for select using (profile_id = auth.uid() or public.is_admin());
create policy checkins_admin  on public.homework_checkins for all using (public.is_admin()) with check (public.is_admin());
-- 客人：會員、自己的作業、作業期間內、只能勾今天或昨天、作業未封存
create policy checkins_insert on public.homework_checkins for insert with check (
  profile_id = auth.uid() and public.is_member()
  and checked_on between public.taipei_today() - 1 and public.taipei_today()
  and exists (select 1 from public.homework h where h.id = homework_id and h.profile_id = auth.uid()
              and not h.archived and checked_on between h.starts_on and h.ends_on));
-- 客人：可取消今天／昨天的勾，但作業已達成（點數已發）就不能取消
create policy checkins_delete on public.homework_checkins for delete using (
  profile_id = auth.uid() and checked_on >= public.taipei_today() - 1
  and exists (select 1 from public.homework h where h.id = homework_id and h.completed_at is null));

create policy points_select on public.points_ledger for select using (profile_id = auth.uid() or public.is_admin());
create policy points_admin  on public.points_ledger for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.homework, public.homework_checkins, public.points_ledger to authenticated, service_role;

-- ── 達成目標自動發點 ─────────────────────────────────────────────────────
create or replace function public.homework_award()
returns trigger language plpgsql security definer set search_path = public as $$
declare h public.homework; n int;
begin
  select * into h from public.homework where id = new.homework_id for update;
  if h.completed_at is not null then return new; end if;
  select count(*) into n from public.homework_checkins where homework_id = h.id;
  if n >= h.target_days then
    update public.homework set completed_at = now() where id = h.id;
    if h.points > 0 then
      insert into public.points_ledger (profile_id, amount, reason, homework_id)
      values (h.profile_id, h.points, '完成回家作業：' || h.title, h.id)
      on conflict (homework_id) do nothing;
    end if;
  end if;
  return new;
end $$;

create trigger homework_checkins_award after insert on public.homework_checkins
  for each row execute function public.homework_award();

-- ── 排行榜（只列會員客人；名字遮一半；依「獲得」的點數排名，兌換扣點不影響名次） ──
create or replace function public.points_leaderboard(p_period text default 'month')
returns table (rank int, name text, points int, is_me boolean)
language sql stable security definer set search_path = public as $$
  with earned as (
    select l.profile_id, sum(l.amount)::int as pts
    from public.points_ledger l
    where l.amount > 0
      and (p_period = 'all' or (l.created_at at time zone 'Asia/Taipei') >= date_trunc('month', now() at time zone 'Asia/Taipei'))
    group by l.profile_id
  ), ranked as (
    select rank() over (order by e.pts desc)::int as rank, e.profile_id, e.pts,
           coalesce(nullif(p.full_name, ''), nullif(p.display_name, ''), '會員') as nm
    from earned e join public.profiles p on p.id = e.profile_id
    where p.member_no is not null and p.role = 'client'
  )
  select r.rank,
         case when char_length(r.nm) <= 1 then r.nm
              when char_length(r.nm) = 2 then left(r.nm, 1) || '*'
              else left(r.nm, 1) || repeat('*', char_length(r.nm) - 2) || right(r.nm, 1) end,
         r.pts, r.profile_id = auth.uid()
  from ranked r
  where (public.is_member() or public.is_admin()) and (r.rank <= 20 or r.profile_id = auth.uid())
  order by r.rank;
$$;
revoke all on function public.points_leaderboard(text) from public, anon;
grant execute on function public.points_leaderboard(text) to authenticated;
