-- 0024：內容改為導流用
--   直播：用 LINE 登入的人都能看（不再限課程會員）
--   模擬教室：
--     ・標記「免費試玩」的單元，登入就能開
--     ・新增課程包時，自動開通 3 個月，從購買日起算；期限內再買就接在目前到期日後面
--     ・期限內看得到所有已公開單元，不再逐一開放（learning_unlocks 保留但不再使用）
--     ・現有課程包仍有效的客戶，從今天起補 3 個月

-- ── 直播 ──
create or replace function public._is_course_member(p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_profile);
$$;
revoke execute on function public._is_course_member(uuid) from public, anon, authenticated;

-- ── 模擬教室 ──
alter table public.learning_modules add column free boolean not null default false;
update public.learning_modules set free = true where path ~ '^(posture-sofa|injury-ankle)\.';

alter table public.learning_grants add column package_id uuid references public.packages(id) on delete cascade;

create or replace function public.can_open_learning(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or (auth.uid() is not null and exists (
    select 1 from public.learning_modules m
     where m.path = p_path and m.published and (m.free or public.has_learning_access())));
$$;
revoke execute on function public.can_open_learning(text) from public, anon;
grant execute on function public.can_open_learning(text) to authenticated;

-- 開通 N 個月，接在 d 當天仍有效的期限後面
create or replace function public._chain_learning(p_profile uuid, p_from date, p_months int, p_package uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cur date; s date;
begin
  perform 1 from public.profiles where id = p_profile for update;
  select max(expires_on) into cur from public.learning_grants
   where profile_id = p_profile and revoked_at is null and expires_on >= p_from;
  s := coalesce(cur + 1, p_from);
  insert into public.learning_grants (profile_id, months, starts_on, expires_on, package_id)
  values (p_profile, p_months, s, (s + make_interval(months => p_months))::date - 1, p_package);
end;
$$;
revoke execute on function public._chain_learning(uuid, date, int, uuid) from public, anon, authenticated;

create or replace function public.package_grant_learning()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._chain_learning(new.profile_id, new.starts_on, 3, new.id);
  return new;
end;
$$;
revoke execute on function public.package_grant_learning() from public, anon, authenticated;
create trigger packages_learning after insert on public.packages
  for each row execute function public.package_grant_learning();

-- 現有客戶：課程包未到期（或不限期）就從今天補 3 個月
do $$
declare r record; today date := (now() at time zone 'Asia/Taipei')::date;
begin
  for r in select distinct profile_id from public.packages where expires_on is null or expires_on >= today loop
    perform public._chain_learning(r.profile_id, today, 3, null);
  end loop;
end $$;
