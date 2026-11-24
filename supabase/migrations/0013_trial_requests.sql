-- 0013：體驗課程改為申請制
--   未開通的客戶不能自己選時段，只能送出體驗申請；由管理員聯繫確認後代為預約
--   開通預約權限（booking_access）後才能自己預約／改期；體驗課一律由管理員預約
--   未開通的客戶仍可取消自己的預約（24 小時前），但不能自己改期

create table public.booking_requests (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  service_id  uuid not null references public.services(id),
  concern     text not null check (char_length(concern) between 1 and 500),
  preferred   text not null check (char_length(preferred) between 1 and 200),
  source      text check (char_length(source) <= 50),
  status      text not null default 'pending' check (status in ('pending', 'contacted', 'booked', 'closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- 每人同時只能有一筆處理中的申請
create unique index booking_requests_open on public.booking_requests (profile_id) where status in ('pending', 'contacted');
create index booking_requests_profile_idx on public.booking_requests (profile_id, created_at);

alter table public.booking_requests enable row level security;
create policy booking_requests_select on public.booking_requests for select
  using (profile_id = auth.uid() or public.is_admin());
create policy booking_requests_admin on public.booking_requests for all
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.booking_requests to authenticated, service_role;

-- 客戶送出申請（只能經由這個函式）
create or replace function public.submit_trial_request(p_service uuid, p_concern text, p_preferred text, p_source text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  who uuid := auth.uid();
  svc public.services;
  new_id uuid;
begin
  if who is null then raise exception 'NOT_LOGGED_IN'; end if;
  select * into svc from public.services where id = p_service;
  if svc.id is null or not svc.is_trial or not svc.bookable then raise exception 'NOT_BOOKABLE'; end if;
  if coalesce(trim(p_concern), '') = '' or coalesce(trim(p_preferred), '') = '' then raise exception 'BAD_INPUT'; end if;
  if not exists (select 1 from public.profiles where id = who and info_completed_at is not null) then raise exception 'NEED_INFO'; end if;
  if public.no_show_count(who) >= 3 then raise exception 'BOOKING_SUSPENDED'; end if;
  if exists (select 1 from public.bookings where profile_id = who and service_id = svc.id and status <> 'cancelled') then
    raise exception 'TRIAL_USED';
  end if;
  if (select count(*) from public.booking_requests where profile_id = who and created_at > now() - interval '30 days') >= 5 then
    raise exception 'TOO_MANY_REQUESTS';
  end if;
  begin
    insert into public.booking_requests (profile_id, service_id, concern, preferred, source)
    values (who, svc.id, trim(p_concern), trim(p_preferred), nullif(trim(p_source), ''))
    returning id into new_id;
  exception when unique_violation then
    raise exception 'REQUEST_PENDING';
  end;
  perform public._booking_notify_post(jsonb_build_object('event', 'request', 'request_id', new_id));
  return new_id;
end;
$$;
revoke execute on function public.submit_trial_request(uuid, text, text, text) from public, anon;
grant execute on function public.submit_trial_request(uuid, text, text, text) to authenticated;

-- 管理員替客戶約好同一項體驗課 → 申請自動標為「已預約」
create or replace function public.request_on_booking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.booking_requests set status = 'booked', updated_at = now()
   where profile_id = new.profile_id and service_id = new.service_id and status in ('pending', 'contacted');
  return new;
end;
$$;
revoke execute on function public.request_on_booking() from public, anon, authenticated;
create trigger bookings_request after insert on public.bookings
  for each row execute function public.request_on_booking();

-- 新增預約：體驗課不再開放客戶自己約（其餘與 0009 相同）
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
    if svc.is_trial then raise exception 'TRIAL_BY_REQUEST'; end if;
    if not exists (select 1 from public.booking_access where profile_id = who) then raise exception 'NEED_ACCESS'; end if;
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

-- 改期：客戶需有預約權限（其餘與 0008 相同）
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
    if not exists (select 1 from public.booking_access where profile_id = auth.uid()) then raise exception 'NEED_ACCESS'; end if;
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
