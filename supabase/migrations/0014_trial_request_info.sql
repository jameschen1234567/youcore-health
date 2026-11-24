-- 0014：送出體驗申請前，姓名、性別、生日（年齡）、手機號碼必須齊全（其餘與 0013 相同）
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
  if not exists (select 1 from public.profiles where id = who and info_completed_at is not null
      and coalesce(trim(full_name), '') <> '' and gender is not null and birthday is not null) then
    raise exception 'NEED_INFO';
  end if;
  if not exists (select 1 from public.profiles where id = who
      and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') ~ '^(09|8869)[0-9]{8}$') then
    raise exception 'BAD_PHONE';
  end if;
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
