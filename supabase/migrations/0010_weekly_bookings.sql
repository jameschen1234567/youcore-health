-- 0010：每週固定預約（管理員代客建立）
--   一次建立連續 N 週、同一星期同一時間的預約，共用同一個 series_id
--   被約走或關閉的那幾週會跳過並回報；已過去的時間也跳過
--   LINE 通知不逐筆發，改成整批建立完後發一則彙整（event = 'series'）

alter table public.bookings add column series_id uuid;
create index bookings_series_idx on public.bookings (series_id) where series_id is not null;

-- 共用：呼叫 booking-notify
create or replace function public._booking_notify_post(p_body jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/booking-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := p_body
  );
end;
$$;
revoke execute on function public._booking_notify_post(jsonb) from public, authenticated;

-- 逐筆通知：系列預約「新增」時不逐筆發（由彙整通知處理），改期／取消照常
create or replace function public.notify_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ev text;
begin
  -- 整批操作（系列建立／系列取消）由該函式自己發一則彙整通知
  if current_setting('youcore.bulk_notify', true) = 'off' then return new; end if;
  if tg_op = 'INSERT' then
    if new.series_id is not null then return new; end if;
    ev := 'created';
  elsif new.status = 'cancelled' and old.status = 'booked' then ev := 'cancelled';
  elsif new.status = 'booked' and new.starts_at is distinct from old.starts_at then ev := 'rescheduled';
  else return new;
  end if;
  perform public._booking_notify_post(jsonb_build_object('booking_id', new.id, 'event', ev,
    'old_starts_at', case when tg_op = 'UPDATE' then old.starts_at end));
  return new;
end;
$$;
revoke execute on function public.notify_booking() from public, authenticated;

-- 建立每週固定預約（管理員限定；與單筆代客預約一樣不檢查營業時間，但不可重疊、不可碰到關閉時段）
create or replace function public.create_weekly_bookings(
  p_profile uuid, p_service uuid, p_first timestamptz, p_weeks int, p_note text default null)
returns table (slot_start timestamptz, ok boolean, reason text)
language plpgsql security definer set search_path = public as $$
declare
  svc public.services;
  sid uuid := gen_random_uuid();
  t timestamptz;
  e timestamptz;
  u timestamptz;
  made int := 0;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_weeks is null or p_weeks < 2 or p_weeks > 26 then raise exception 'BAD_WEEKS'; end if;
  if not exists (select 1 from public.profiles where id = p_profile) then raise exception 'NOT_FOUND'; end if;
  select * into svc from public.services where id = p_service;
  if svc.id is null then raise exception 'NO_SERVICE'; end if;

  perform pg_advisory_xact_lock(hashtext('youcore-booking'));
  for i in 0 .. p_weeks - 1 loop
    t := p_first + make_interval(days => 7 * i);   -- 台灣沒有日光節約，加 7 天時間不變
    e := t + make_interval(mins => svc.duration_min);
    u := e + make_interval(mins => svc.buffer_min);
    slot_start := t;
    if t < now() then
      ok := false; reason := 'PAST';
    elsif exists (select 1 from public.blocked_times b where b.starts_at < u and b.ends_at > t) then
      ok := false; reason := 'CLOSED';
    else
      begin
        insert into public.bookings (profile_id, service_id, starts_at, ends_at, block_until, note, series_id)
        values (p_profile, svc.id, t, e, u, nullif(trim(p_note), ''), sid);
        ok := true; reason := null; made := made + 1;
      exception when exclusion_violation then
        ok := false; reason := 'TAKEN';
      end;
    end if;
    return next;
  end loop;

  if made > 0 then
    perform public._booking_notify_post(jsonb_build_object('event', 'series', 'series_id', sid));
  end if;
end;
$$;

-- 取消同一系列中某筆之後（含）所有還沒開始的預約（管理員限定）；回傳取消筆數，LINE 只發一則彙整
create or replace function public.cancel_series_from(p_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  n int;
  ids uuid[];
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into b from public.bookings where id = p_id;
  if b.id is null or b.series_id is null then raise exception 'NOT_FOUND'; end if;
  perform set_config('youcore.bulk_notify', 'off', true);
  with c as (
    update public.bookings x set status = 'cancelled', cancelled_by = 'admin', updated_at = now()
     where x.series_id = b.series_id and x.status = 'booked' and x.starts_at >= b.starts_at and x.starts_at > now()
    returning x.id
  )
  select array_agg(id) into ids from c;
  perform set_config('youcore.bulk_notify', 'on', true);
  n := coalesce(array_length(ids, 1), 0);
  if n > 0 then
    perform public._booking_notify_post(jsonb_build_object('event', 'series_cancelled', 'booking_ids', to_jsonb(ids)));
  end if;
  return n;
end;
$$;
