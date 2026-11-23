-- 0008：線上預約
-- 規則（設計見 docs/superpowers/specs/2026-11-23-booking-design.md）：
--   營業：週二至週日 10:00–20:30（台北時間），開始時間每 30 分一格，服務結束不晚於 20:30
--   客戶：最晚開始前 3 小時、最遠 30 天內預約；開始前 24 小時之前可自行改期／取消
--   無故未到累計 3 次停權線上預約（管理員可恢復）；每人最多 4 筆未來預約
--   客戶只能透過下列 RPC 寫入預約；管理員可代客預約（略過時間限制，但不可重疊）

create extension if not exists btree_gist;

-- ── 服務 ────────────────────────────────────────────────────────────────────
create table public.services (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  duration_min int  not null check (duration_min between 15 and 240),
  buffer_min   int  not null default 10 check (buffer_min between 0 and 60),
  bookable     boolean not null default true,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);

insert into public.services (name, duration_min, buffer_min, bookable, sort_order) values
  ('科技結合運動按摩',     60, 10, true,  1),
  ('一對一肌力與體能課程', 60, 10, true,  2),
  ('運動傷害防護與康復訓練', 90, 10, true,  3),
  ('專業健康檢測',         75, 10, false, 4),   -- 時長待 James 確認後再開放
  ('頌缽療育',             60, 10, false, 5);   -- 時長待 James 確認後再開放

-- ── 預約 ────────────────────────────────────────────────────────────────────
create table public.bookings (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  service_id   uuid not null references public.services(id),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,   -- 服務結束
  block_until  timestamptz not null,   -- 含緩衝，這段時間別人不能預約
  status       text not null default 'booked'
               check (status in ('booked', 'cancelled', 'completed', 'no_show')),
  cancelled_by text check (cancelled_by in ('client', 'admin')),
  note         text check (char_length(note) <= 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_at > starts_at and block_until >= ends_at),
  constraint bookings_no_overlap exclude using gist (tstzrange(starts_at, block_until) with &&)
    where (status = 'booked')
);
create index bookings_profile_idx on public.bookings (profile_id, starts_at);
create index bookings_starts_idx on public.bookings (starts_at);

-- ── 關閉時段 ────────────────────────────────────────────────────────────────
create table public.blocked_times (
  id         uuid primary key default gen_random_uuid(),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null check (ends_at > starts_at),
  reason     text check (char_length(reason) <= 100),
  created_at timestamptz not null default now()
);
create index blocked_times_range_idx on public.blocked_times (starts_at, ends_at);

alter table public.profiles add column booking_reset_at timestamptz;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.services enable row level security;
alter table public.bookings enable row level security;
alter table public.blocked_times enable row level security;

create policy services_read on public.services for select to authenticated using (true);
create policy services_admin on public.services for all using (public.is_admin()) with check (public.is_admin());

create policy bookings_select on public.bookings for select
  using (profile_id = auth.uid() or public.is_admin());
create policy bookings_admin on public.bookings for all
  using (public.is_admin()) with check (public.is_admin());

create policy blocked_times_admin on public.blocked_times for all
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.services, public.bookings, public.blocked_times to authenticated, service_role;

-- ── 工具函式 ────────────────────────────────────────────────────────────────

-- 未到次數（恢復權限之後才算）
create or replace function public.no_show_count(p_profile uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.bookings b
  where b.profile_id = p_profile and b.status = 'no_show'
    and (p_profile = auth.uid() or public.is_admin())
    and b.starts_at > coalesce((select booking_reset_at from public.profiles where id = p_profile), '-infinity');
$$;

-- 被佔用的時間（不含姓名），給客戶畫面顯示「已預約」
create or replace function public.get_busy(p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz, kind text)
language sql stable security definer set search_path = public as $$
  select b.starts_at, b.block_until, 'booked' from public.bookings b
   where auth.uid() is not null and b.status = 'booked'
     and b.starts_at < p_to and b.block_until > p_from and p_to - p_from <= interval '62 days'
  union all
  select t.starts_at, t.ends_at, 'blocked' from public.blocked_times t
   where auth.uid() is not null
     and t.starts_at < p_to and t.ends_at > p_from and p_to - p_from <= interval '62 days';
$$;

-- 檢查時段是否符合營業規則（客戶用；管理員代客預約不檢查）
create or replace function public._booking_check_slot(p_starts timestamptz, p_ends timestamptz)
returns void language plpgsql stable set search_path = public as $$
declare
  ls timestamp := p_starts at time zone 'Asia/Taipei';
  le timestamp := p_ends at time zone 'Asia/Taipei';
begin
  if extract(isodow from ls) = 1 then raise exception 'CLOSED_DAY'; end if;
  if ls::time < time '10:00' or le::time > time '20:30' or le::date <> ls::date then raise exception 'OUTSIDE_HOURS'; end if;
  if extract(minute from ls)::int % 30 <> 0 or extract(second from ls) <> 0 then raise exception 'BAD_START'; end if;
  if p_starts < now() + interval '3 hours' then raise exception 'TOO_SOON'; end if;
  if p_starts > now() + interval '30 days' then raise exception 'TOO_FAR'; end if;
end;
$$;
revoke execute on function public._booking_check_slot(timestamptz, timestamptz) from public, authenticated;

-- 檢查是否碰到關閉時段
create or replace function public._booking_check_blocked(p_starts timestamptz, p_until timestamptz)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from public.blocked_times t where t.starts_at < p_until and t.ends_at > p_starts) then
    raise exception 'SLOT_TAKEN';
  end if;
end;
$$;
revoke execute on function public._booking_check_blocked(timestamptz, timestamptz) from public, authenticated;

-- ── 預約 RPC ────────────────────────────────────────────────────────────────

-- 新增預約。p_profile 只有管理員能指定（代客預約）。
create or replace function public.create_booking(p_service uuid, p_starts timestamptz, p_note text default null, p_profile uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  admin boolean := public.is_admin();
  who uuid := auth.uid();
  svc public.services;
  e timestamptz;
  u timestamptz;
  new_id uuid;
begin
  if who is null then raise exception 'NOT_LOGGED_IN'; end if;
  if p_profile is not null and p_profile <> who then
    if not admin then raise exception 'FORBIDDEN'; end if;
    who := p_profile;
  end if;
  select * into svc from public.services where id = p_service;
  if svc.id is null then raise exception 'NO_SERVICE'; end if;
  e := p_starts + make_interval(mins => svc.duration_min);
  u := e + make_interval(mins => svc.buffer_min);

  perform pg_advisory_xact_lock(hashtext('youcore-booking'));
  if not admin then
    if not svc.bookable then raise exception 'NOT_BOOKABLE'; end if;
    if public.no_show_count(who) >= 3 then raise exception 'BOOKING_SUSPENDED'; end if;
    if (select count(*) from public.bookings where profile_id = who and status = 'booked' and starts_at > now()) >= 4 then
      raise exception 'TOO_MANY';
    end if;
    perform public._booking_check_slot(p_starts, e);
  end if;
  perform public._booking_check_blocked(p_starts, u);

  begin
    insert into public.bookings (profile_id, service_id, starts_at, ends_at, block_until, note)
    values (who, svc.id, p_starts, e, u, nullif(trim(p_note), ''))
    returning id into new_id;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN';
  end;
  return new_id;
end;
$$;

-- 改期：客戶只能改自己、仍有效、且原本開始前 24 小時之前的預約
create or replace function public.reschedule_booking(p_id uuid, p_starts timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  admin boolean := public.is_admin();
  b public.bookings;
  svc public.services;
  e timestamptz;
  u timestamptz;
begin
  select * into b from public.bookings where id = p_id for update;
  if b.id is null or (b.profile_id <> auth.uid() and not admin) then raise exception 'NOT_FOUND'; end if;
  if b.status <> 'booked' then raise exception 'NOT_ACTIVE'; end if;
  select * into svc from public.services where id = b.service_id;
  e := p_starts + make_interval(mins => svc.duration_min);
  u := e + make_interval(mins => svc.buffer_min);

  perform pg_advisory_xact_lock(hashtext('youcore-booking'));
  if not admin then
    if b.starts_at <= now() + interval '24 hours' then raise exception 'LOCKED_24H'; end if;
    perform public._booking_check_slot(p_starts, e);
  end if;
  perform public._booking_check_blocked(p_starts, u);

  begin
    update public.bookings set starts_at = p_starts, ends_at = e, block_until = u, updated_at = now() where id = p_id;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN';
  end;
end;
$$;

-- 取消
create or replace function public.cancel_booking(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  admin boolean := public.is_admin();
  b public.bookings;
begin
  select * into b from public.bookings where id = p_id for update;
  if b.id is null or (b.profile_id <> auth.uid() and not admin) then raise exception 'NOT_FOUND'; end if;
  if b.status <> 'booked' then raise exception 'NOT_ACTIVE'; end if;
  if not admin and b.starts_at <= now() + interval '24 hours' then raise exception 'LOCKED_24H'; end if;
  update public.bookings
     set status = 'cancelled', cancelled_by = case when b.profile_id = auth.uid() and not admin then 'client' else 'admin' end,
         updated_at = now()
   where id = p_id;
end;
$$;

-- 恢復預約權限（之前的未到不再計算）
create or replace function public.admin_reset_no_show(p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update public.profiles set booking_reset_at = now() where id = p_profile;
end;
$$;

-- ── LINE 通知：新增、改期、取消 ────────────────────────────────────────────
create or replace function public.notify_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ev text;
begin
  if tg_op = 'INSERT' then ev := 'created';
  elsif new.status = 'cancelled' and old.status = 'booked' then ev := 'cancelled';
  elsif new.status = 'booked' and new.starts_at is distinct from old.starts_at then ev := 'rescheduled';
  else return new;
  end if;
  perform net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/booking-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := jsonb_build_object('booking_id', new.id, 'event', ev,
                                  'old_starts_at', case when tg_op = 'UPDATE' then old.starts_at end)
  );
  return new;
end;
$$;
revoke execute on function public.notify_booking() from public, authenticated;

create trigger bookings_notify after insert or update of status, starts_at on public.bookings
  for each row execute function public.notify_booking();
