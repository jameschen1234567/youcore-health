-- 0016：會員線上直播（YouTube 不公開影片）
--   觀看資格：管理員、已開通預約（booking_access）、或有有效課程包（未到期且有剩餘堂數）
--   影片 ID 不直接開放讀取，只有符合資格且在開放時間內才能由 get_live_video 取得
--   開放時間：開始前 15 分鐘起，到管理員按「結束」為止（忘記按則開始後 6 小時自動結束），之後依 replay_days 開放回放

create table public.live_streams (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 80),
  description  text check (char_length(description) <= 500),
  starts_at    timestamptz not null,
  video_id     text check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  replay_days  int  not null default 30 check (replay_days between 0 and 365),
  ended_at     timestamptz,
  cancelled    boolean not null default false,
  created_at   timestamptz not null default now()
);
create index live_streams_starts_idx on public.live_streams (starts_at);

alter table public.live_streams enable row level security;
create policy live_streams_admin on public.live_streams for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.live_streams from anon;
grant select, insert, update, delete on public.live_streams to authenticated, service_role;

-- 是否為有觀看資格的課程會員
create or replace function public._is_course_member(p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_profile and role = 'admin')
      or exists (select 1 from public.booking_access where profile_id = p_profile)
      or exists (
        select 1 from public.packages p
         where p.profile_id = p_profile
           and (p.expires_on is null or p.expires_on >= (now() at time zone 'Asia/Taipei')::date)
           and p.total > coalesce((select sum(u.amount) from public.package_usages u where u.package_id = p.id), 0));
$$;
revoke execute on function public._is_course_member(uuid) from public, anon, authenticated;

-- upcoming | live | replay | closed | cancelled
create or replace function public._live_phase(s public.live_streams)
returns text language sql stable set search_path = public as $$
  select case
    when s.cancelled then 'cancelled'
    when now() < coalesce(s.ended_at, s.starts_at + interval '6 hours') then
      case when now() < s.starts_at - interval '15 minutes' then 'upcoming' else 'live' end
    when now() < coalesce(s.ended_at, s.starts_at + interval '6 hours') + make_interval(days => s.replay_days) then 'replay'
    else 'closed' end;
$$;
revoke execute on function public._live_phase(public.live_streams) from public, anon, authenticated;

-- 直播清單（不含影片 ID）；已取消或回放過期的不列出
create or replace function public.list_live_streams()
returns table (id uuid, title text, description text, starts_at timestamptz, phase text, can_watch boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.title, s.description, s.starts_at, public._live_phase(s), public._is_course_member(auth.uid())
    from public.live_streams s
   where auth.uid() is not null and public._live_phase(s) in ('upcoming', 'live', 'replay')
   order by s.starts_at;
$$;
revoke execute on function public.list_live_streams() from public, anon;
grant execute on function public.list_live_streams() to authenticated;

-- 取得影片 ID（資格與時間都要符合）
create or replace function public.get_live_video(p_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  s public.live_streams;
begin
  if auth.uid() is null then raise exception 'NOT_LOGGED_IN'; end if;
  if not public._is_course_member(auth.uid()) then raise exception 'NOT_MEMBER'; end if;
  select * into s from public.live_streams where live_streams.id = p_id;
  if s.id is null then raise exception 'NOT_FOUND'; end if;
  if public._live_phase(s) not in ('live', 'replay') then raise exception 'NOT_OPEN'; end if;
  if s.video_id is null then raise exception 'NOT_READY'; end if;
  return s.video_id;
end;
$$;
revoke execute on function public.get_live_video(uuid) from public, anon;
grant execute on function public.get_live_video(uuid) to authenticated;
