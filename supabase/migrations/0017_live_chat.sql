-- 0017：直播留言、按讚、主持管理
--   留言只有課程會員、直播中才能送；回放只能看。客戶端每幾秒輪詢 get_live_feed（不用 Realtime，沒有同時連線上限）
--   private = 只給主持人看（本人與管理員看得到）；hidden = 管理員刪除（其他人只收到「移除這則」）

create table public.live_comments (
  id          bigint generated always as identity primary key,
  stream_id   uuid not null references public.live_streams(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  name        text not null,              -- 送出當下的 LINE 名稱
  is_host     boolean not null default false,
  body        text not null check (char_length(body) between 1 and 200),
  private     boolean not null default false,
  pinned      boolean not null default false,
  answered    boolean not null default false,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index live_comments_stream_idx on public.live_comments (stream_id, updated_at);
create index live_comments_author_idx on public.live_comments (profile_id, created_at);

create table public.live_likes (
  stream_id  uuid not null references public.live_streams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  n          int not null default 0 check (n between 0 and 500),
  primary key (stream_id, profile_id)
);

create table public.live_mutes (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 一律經由下列函式存取，資料表不開放前端直接讀寫（管理員刪除客戶時由 service role／cascade 處理）
alter table public.live_comments enable row level security;
alter table public.live_likes enable row level security;
alter table public.live_mutes enable row level security;
revoke all on public.live_comments, public.live_likes, public.live_mutes from anon, authenticated;
grant select, insert, update, delete on public.live_comments, public.live_likes, public.live_mutes to service_role;

-- 留言動態。p_since 為 null 取最近 200 則；否則取該時間後有變動的（往前重疊 5 秒，前端以 id 合併）
create or replace function public.get_live_feed(p_id uuid, p_since timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  who uuid := auth.uid();
  adm boolean := public.is_admin();
  s public.live_streams;
  ph text;
  list jsonb;
begin
  if who is null then raise exception 'NOT_LOGGED_IN'; end if;
  if not public._is_course_member(who) then raise exception 'NOT_MEMBER'; end if;
  select * into s from public.live_streams where id = p_id;
  if s.id is null then raise exception 'NOT_FOUND'; end if;
  ph := public._live_phase(s);
  if not adm and ph not in ('live', 'replay') then raise exception 'NOT_OPEN'; end if;

  select coalesce(jsonb_agg(x.j order by x.id), '[]'::jsonb) into list from (
    select c.id, case when c.hidden then jsonb_build_object('id', c.id, 'hidden', true)
      else jsonb_build_object('id', c.id, 'name', c.name, 'is_host', c.is_host, 'body', c.body, 'private', c.private,
             'pinned', c.pinned, 'answered', c.answered, 'created_at', c.created_at, 'mine', c.profile_id = who)
           || case when adm then jsonb_build_object('muted', exists (select 1 from public.live_mutes m where m.profile_id = c.profile_id)) else '{}'::jsonb end
      end as j
      from public.live_comments c
     where c.stream_id = p_id
       and (adm or not c.private or c.profile_id = who)
       and (case when p_since is null then not c.hidden else c.updated_at > p_since - interval '5 seconds' end)
     order by (p_since is null and c.pinned) desc, c.id desc
     limit 200
  ) x;
  return jsonb_build_object('comments', list, 'phase', ph, 'now', now(),
    'likes', (select coalesce(sum(l.n), 0) from public.live_likes l where l.stream_id = p_id),
    'muted', exists (select 1 from public.live_mutes m where m.profile_id = who));
end;
$$;

-- 送出留言
create or replace function public.post_live_comment(p_id uuid, p_body text, p_private boolean default false)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  who uuid := auth.uid();
  adm boolean := public.is_admin();
  s public.live_streams;
  txt text := trim(coalesce(p_body, ''));
  new_id bigint;
begin
  if who is null then raise exception 'NOT_LOGGED_IN'; end if;
  if not public._is_course_member(who) then raise exception 'NOT_MEMBER'; end if;
  select * into s from public.live_streams where id = p_id;
  if s.id is null then raise exception 'NOT_FOUND'; end if;
  if public._live_phase(s) <> 'live' then raise exception 'CHAT_CLOSED'; end if;
  if txt = '' or char_length(txt) > 200 then raise exception 'BAD_COMMENT'; end if;
  perform pg_advisory_xact_lock(hashtext('live-comment:' || who::text));
  if not adm then
    if exists (select 1 from public.live_mutes where profile_id = who) then raise exception 'MUTED'; end if;
    if exists (select 1 from public.live_comments where profile_id = who and created_at > now() - interval '5 seconds') then raise exception 'TOO_FAST'; end if;
  end if;
  insert into public.live_comments (stream_id, profile_id, name, is_host, body, private)
  select p_id, who, coalesce(nullif(trim(p.display_name), ''), '會員'), adm, txt, coalesce(p_private, false) and not adm
    from public.profiles p where p.id = who
  returning id into new_id;
  return new_id;
end;
$$;

-- 按讚（前端累積後一次送出；每人每場最多 500）
create or replace function public.like_live(p_id uuid, p_n int)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.live_streams;
begin
  if auth.uid() is null then raise exception 'NOT_LOGGED_IN'; end if;
  if not public._is_course_member(auth.uid()) then raise exception 'NOT_MEMBER'; end if;
  select * into s from public.live_streams where id = p_id;
  if s.id is null then raise exception 'NOT_FOUND'; end if;
  if public._live_phase(s) <> 'live' then raise exception 'CHAT_CLOSED'; end if;
  insert into public.live_likes as l (stream_id, profile_id, n) values (p_id, auth.uid(), least(greatest(coalesce(p_n, 1), 1), 50))
  on conflict (stream_id, profile_id) do update set n = least(l.n + excluded.n, 500);
end;
$$;

-- 主持管理（管理員）
create or replace function public.moderate_live(p_comment bigint, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.live_comments;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into c from public.live_comments where id = p_comment;
  if c.id is null then raise exception 'NOT_FOUND'; end if;
  if p_action = 'pin' then
    if c.private then raise exception 'PRIVATE_COMMENT'; end if;   -- 私下提問不可置頂公開
    update public.live_comments set pinned = (id = p_comment), updated_at = now()
     where stream_id = c.stream_id and (pinned or id = p_comment);
  elsif p_action = 'unpin' then
    update public.live_comments set pinned = false, updated_at = now() where id = p_comment;
  elsif p_action in ('answer', 'unanswer') then
    update public.live_comments set answered = (p_action = 'answer'), updated_at = now() where id = p_comment;
  elsif p_action = 'hide' then
    update public.live_comments set hidden = true, pinned = false, updated_at = now() where id = p_comment;
  elsif p_action in ('mute', 'unmute') then
    if p_action = 'mute' then
      if exists (select 1 from public.profiles where id = c.profile_id and role = 'admin') then raise exception 'FORBIDDEN'; end if;
      insert into public.live_mutes (profile_id) values (c.profile_id) on conflict do nothing;
    else
      delete from public.live_mutes where profile_id = c.profile_id;
    end if;
    update public.live_comments set updated_at = now() where stream_id = c.stream_id and profile_id = c.profile_id;
  else
    raise exception 'BAD_ACTION';
  end if;
end;
$$;

revoke execute on function public.get_live_feed(uuid, timestamptz), public.post_live_comment(uuid, text, boolean),
  public.like_live(uuid, int), public.moderate_live(bigint, text) from public, anon;
grant execute on function public.get_live_feed(uuid, timestamptz), public.post_live_comment(uuid, text, boolean),
  public.like_live(uuid, int), public.moderate_live(bigint, text) to authenticated;
