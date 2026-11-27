-- 0033：會員影像紀錄（照片／Before-After 對照／影片連結＋教練講解）
-- 照片：私有 bucket member-media，路徑 <profile_id>/<uuid>.jpg，只有本人與管理員能讀，只有管理員能寫。
-- 影片：只存 Google 雲端／YouTube 連結，不佔 App 空間。
-- 每位客人須先由管理員勾選「已取得影像使用同意」（profiles.media_consent_at）才能新增影像。

-- ── 影像同意（只有管理員能改） ─────────────────────────────────────────────
alter table public.profiles add column media_consent_at timestamptz;
grant update (media_consent_at) on public.profiles to authenticated;

create or replace function public.prevent_media_consent_change()
returns trigger language plpgsql as $$
begin
  if new.media_consent_at is distinct from old.media_consent_at
     and current_user = 'authenticated' and not public.is_admin() then
    raise exception 'media_consent_at can only be changed by admin';
  end if;
  return new;
end $$;
create trigger profiles_media_consent_guard before update on public.profiles
  for each row execute function public.prevent_media_consent_change();

-- ── 影像紀錄 ─────────────────────────────────────────────────────────────
create table public.member_media (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('photo', 'compare', 'video')),
  title        text not null check (char_length(title) between 1 and 60),
  note         text check (char_length(note) <= 2000),
  taken_on     date not null,
  session_id   uuid references public.training_sessions(id) on delete set null,
  photo_path   text,
  photo2_path  text,
  video_url    text check (video_url ~ '^https://' and char_length(video_url) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (photo_path is null or photo_path like profile_id::text || '/%'),
  check (photo2_path is null or photo2_path like profile_id::text || '/%'),
  check (
    (kind = 'photo'   and photo_path is not null and photo2_path is null and video_url is null) or
    (kind = 'compare' and photo_path is not null and photo2_path is not null and video_url is null) or
    (kind = 'video'   and video_url is not null and photo_path is null and photo2_path is null))
);
create index member_media_profile on public.member_media (profile_id, taken_on desc);
create index member_media_session on public.member_media (session_id);

alter table public.member_media enable row level security;
create policy member_media_select on public.member_media for select using (profile_id = auth.uid() or public.is_admin());
create policy member_media_update on public.member_media for update using (public.is_admin()) with check (public.is_admin());
create policy member_media_delete on public.member_media for delete using (public.is_admin());
-- 新增：管理員，且該客人已取得影像同意
create policy member_media_insert on public.member_media for insert with check (
  public.is_admin() and exists (select 1 from public.profiles p where p.id = profile_id and p.media_consent_at is not null));
grant select, insert, update, delete on public.member_media to authenticated, service_role;

create or replace function public.member_media_touch()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger member_media_touch before update on public.member_media
  for each row execute function public.member_media_touch();

-- ── 私有空間 ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('member-media', 'member-media', false, 5242880, array['image/jpeg']);

create policy member_media_read on storage.objects for select to authenticated
  using (bucket_id = 'member-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy member_media_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'member-media' and public.is_admin());
create policy member_media_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'member-media' and public.is_admin());
create policy member_media_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'member-media' and public.is_admin());
