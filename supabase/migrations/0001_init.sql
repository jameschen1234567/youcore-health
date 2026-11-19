-- YouCore LIFF App｜初始資料表、RLS、Storage
-- 對應規格：docs/superpowers/specs/2026-11-20-liff-foot-content-design.md 第三、四節

-- ── 角色判斷 ────────────────────────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  line_user_id  text unique not null,
  display_name  text,
  role          text not null default 'client' check (role in ('client', 'admin')),
  created_at    timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 客戶不能自己把 role 改成 admin
create or replace function public.prevent_role_change()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'role can only be changed by admin';
  end if;
  return new;
end $$;

create trigger profiles_role_guard before update on public.profiles
  for each row execute function public.prevent_role_change();

-- ── 個資同意與刪除 ──────────────────────────────────────────────────────────
create table public.consents (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  consent_version  text not null,
  agreed_at        timestamptz not null default now(),
  revoked_at       timestamptz
);

create table public.deletion_requests (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  requested_at  timestamptz not null default now(),
  status        text not null default 'pending' check (status in ('pending', 'done', 'rejected'))
);

-- ── 量表與疼痛地圖 ──────────────────────────────────────────────────────────
create table public.questionnaire_responses (
  id                     uuid primary key default gen_random_uuid(),
  profile_id             uuid not null references public.profiles(id) on delete cascade,
  questionnaire_key      text not null,
  questionnaire_version  text not null,
  answers                jsonb not null,
  scores                 jsonb,
  computable             boolean not null default true,
  submitted_at           timestamptz not null default now()
);

create table public.pain_maps (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  regions       jsonb not null,           -- { "region_key": 0..10 }
  submitted_at  timestamptz not null default now()
);

-- ── 足部量測與訂單 ──────────────────────────────────────────────────────────
create table public.foot_measurements (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  side           text not null check (side in ('left', 'right')),
  length_mm      numeric(5,1) not null,
  width_mm       numeric(5,1) not null,
  width_class    text,
  photo_path     text,
  algo_version   text not null,
  quality_flags  jsonb,
  created_at     timestamptz not null default now()
);

create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  product_type  text not null check (product_type in ('insole', 'toe_shoe', 'slipper')),
  status        text not null default 'assessed'
                check (status in ('assessed', 'designing', 'printing', 'ready', 'picked_up')),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  status      text not null,
  created_at  timestamptz not null default now()
);

-- AFTER 才能確保 orders 列已存在（order_events 外鍵）
-- security definer：order_events 沒有 insert 政策，只能經由此觸發器寫入
create or replace function public.log_order_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_events (order_id, status) values (new.id, new.status);
  end if;
  return null;
end $$;

create or replace function public.touch_order()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger orders_touch before update on public.orders
  for each row execute function public.touch_order();
create trigger orders_event after insert or update on public.orders
  for each row execute function public.log_order_event();

-- ── 衛教內容快取 ────────────────────────────────────────────────────────────
create table public.content_items (
  id               uuid primary key default gen_random_uuid(),
  notion_page_id   text unique not null,
  type             text not null check (type in ('article', 'video', 'brand')),
  title            text not null,
  category         text[] not null default '{}',
  cover_url        text,
  video_url        text,
  body             jsonb,
  related_service  text,
  published_at     date,
  synced_at        timestamptz not null default now()
);

create table public.sync_logs (
  id             uuid primary key default gen_random_uuid(),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  ok             boolean,
  items_synced   int,
  error          text
);

-- ── Row Level Security ─────────────────────────────────────────────────────
alter table public.profiles                enable row level security;
alter table public.consents                enable row level security;
alter table public.deletion_requests       enable row level security;
alter table public.questionnaire_responses enable row level security;
alter table public.pain_maps               enable row level security;
alter table public.foot_measurements       enable row level security;
alter table public.orders                  enable row level security;
alter table public.order_events            enable row level security;
alter table public.content_items           enable row level security;
alter table public.sync_logs               enable row level security;

-- profiles：本人可讀、可改顯示名稱；admin 全部。新增由 line-auth（service role）負責。
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_admin());
-- 一般登入者只能改 display_name（role 另有觸發器把關，line_user_id 不可改）
revoke update on public.profiles from authenticated;
grant update (display_name, role) on public.profiles to authenticated;

-- 客戶自己的資料：本人讀＋新增；admin 全權
do $$
declare t text;
begin
  foreach t in array array['consents','deletion_requests','questionnaire_responses','pain_maps','foot_measurements']
  loop
    execute format('create policy %1$s_select on public.%1$s for select using (profile_id = auth.uid() or public.is_admin())', t);
    execute format('create policy %1$s_insert on public.%1$s for insert with check (profile_id = auth.uid())', t);
    execute format('create policy %1$s_admin on public.%1$s for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- 訂單：客戶只能看；建立與更新只有 admin
create policy orders_select on public.orders for select
  using (profile_id = auth.uid() or public.is_admin());
create policy orders_admin on public.orders for all
  using (public.is_admin()) with check (public.is_admin());

create policy order_events_select on public.order_events for select
  using (public.is_admin() or exists (
    select 1 from public.orders o where o.id = order_id and o.profile_id = auth.uid()));

-- 內容：登入者可讀；寫入只有 service role（RLS 不擋 service role）
create policy content_select on public.content_items for select
  using (auth.role() = 'authenticated');
create policy sync_logs_admin on public.sync_logs for select
  using (public.is_admin());

-- ── Storage ────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values
  ('foot-photos', 'foot-photos', false),
  ('content-images', 'content-images', true)
on conflict (id) do nothing;

-- foot-photos 路徑：{profile_id}/{measurement_id}/{left|right}.jpg
create policy foot_photos_read on storage.objects for select
  using (bucket_id = 'foot-photos'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy foot_photos_write on storage.objects for insert
  with check (bucket_id = 'foot-photos'
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy foot_photos_admin_delete on storage.objects for delete
  using (bucket_id = 'foot-photos' and public.is_admin());
