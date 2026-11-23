-- 0009：預約權限與體驗課程
--   正式課程：管理員開通權限（booking_access 有一列）的客戶才能線上預約
--   體驗課程：任何人都能約，每種體驗課每人限 1 次（取消的不算）；時長已含 30 分鐘免費身體檢測
--   緩衝時間：全部歸 0（之後可在後台「服務設定」調整）

alter table public.services add column is_trial boolean not null default false;
alter table public.services add column description text check (char_length(description) <= 100);
alter table public.services alter column buffer_min set default 0;
update public.services set buffer_min = 0;

insert into public.services (name, duration_min, buffer_min, bookable, sort_order, is_trial, description) values
  ('肌力體驗課程',     90,  0, true, 11, true, '60 分鐘體驗＋30 分鐘免費身體檢測'),
  ('按摩體驗課程',     90,  0, true, 12, true, '60 分鐘體驗＋30 分鐘免費身體檢測'),
  ('科技修復體驗課程', 90,  0, true, 13, true, '60 分鐘體驗＋30 分鐘免費身體檢測'),
  ('康復訓練體驗課程', 120, 0, true, 14, true, '90 分鐘體驗＋30 分鐘免費身體檢測');

-- 預約權限（另開一張表，客戶無法自己改 profiles 來開通）
create table public.booking_access (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles(id) on delete set null
);
alter table public.booking_access enable row level security;
create policy booking_access_select on public.booking_access for select
  using (profile_id = auth.uid() or public.is_admin());
create policy booking_access_admin on public.booking_access for all
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.booking_access to authenticated, service_role;

-- 新增預約：加上權限與體驗課次數檢查（其餘與 0008 相同）
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
    if svc.is_trial then
      if exists (select 1 from public.bookings where profile_id = who and service_id = svc.id and status <> 'cancelled') then
        raise exception 'TRIAL_USED';
      end if;
    elsif not exists (select 1 from public.booking_access where profile_id = who) then
      raise exception 'NEED_ACCESS';
    end if;
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
