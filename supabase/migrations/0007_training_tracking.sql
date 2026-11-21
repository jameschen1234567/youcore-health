-- 0007：客戶基本資料、身體組成、訓練紀錄（設計見 docs/superpowers/specs/2026-11-22-training-tracking-design.md）

-- ── 基本資料（放在 profiles） ─────────────────────────────────────────────
alter table public.profiles
  add column full_name          text,
  add column gender             text check (gender in ('male', 'female', 'other')),
  add column birthday           date,
  add column phone              text,
  add column email              text,
  add column height_cm          numeric(4,1) check (height_cm between 80 and 250),
  add column medical_notes      text,
  add column info_completed_at  timestamptz;

-- 客戶可以改自己的基本資料（身高另由 trigger 限制只能首次填寫）
grant update (full_name, gender, birthday, phone, email, height_cm, medical_notes, info_completed_at)
  on public.profiles to authenticated;

-- 身高：客戶只能在原本是空值時填一次，之後只有管理員能改
create or replace function public.prevent_height_change()
returns trigger language plpgsql as $$
begin
  if old.height_cm is not null
     and new.height_cm is distinct from old.height_cm
     and current_user = 'authenticated'
     and not public.is_admin() then
    raise exception 'height can only be changed by admin';
  end if;
  return new;
end $$;

create trigger profiles_height_guard before update on public.profiles
  for each row execute function public.prevent_height_change();

-- ── 身體組成 ───────────────────────────────────────────────────────────────
create table public.body_compositions (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  measured_on     date not null,
  weight_kg       numeric(5,1) check (weight_kg > 0),
  muscle_kg       numeric(5,1) check (muscle_kg > 0),
  fat_kg          numeric(5,1) check (fat_kg >= 0),
  visceral_level  numeric(4,1) check (visceral_level >= 0),
  note            text,
  created_at      timestamptz not null default now()
);
create index body_compositions_profile on public.body_compositions (profile_id, measured_on);

-- ── 訓練動作清單 ───────────────────────────────────────────────────────────
create table public.exercises (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  category    text not null default 'other',
  is_custom   boolean not null default false,
  sort_order  int not null default 100,
  created_at  timestamptz not null default now()
);

insert into public.exercises (name, category, sort_order) values
  ('背蹲舉',         'lower', 10),
  ('前蹲舉',         'lower', 11),
  ('高腳杯深蹲',     'lower', 12),
  ('傳統硬舉',       'hinge', 20),
  ('相撲硬舉',       'hinge', 21),
  ('羅馬尼亞硬舉',   'hinge', 22),
  ('六角槓硬舉',     'hinge', 23),
  ('臀推',           'hinge', 24),
  ('腿推',           'lower', 30),
  ('保加利亞分腿蹲', 'lower', 31),
  ('弓箭步',         'lower', 32),
  ('槓鈴臥推',       'push',  40),
  ('上斜臥推',       'push',  41),
  ('啞鈴臥推',       'push',  42),
  ('站姿肩推',       'push',  43),
  ('啞鈴肩推',       'push',  44),
  ('雙槓撐體',       'push',  45),
  ('引體向上',       'pull',  50),
  ('滑輪下拉',       'pull',  51),
  ('槓鈴划船',       'pull',  52),
  ('啞鈴單臂划船',   'pull',  53),
  ('坐姿划船',       'pull',  54);

-- ── 訓練紀錄 ───────────────────────────────────────────────────────────────
create table public.training_sessions (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  session_date  date not null,
  note          text,
  created_at    timestamptz not null default now()
);
create index training_sessions_profile on public.training_sessions (profile_id, session_date);

create table public.training_sets (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.training_sessions(id) on delete cascade,
  exercise_id  uuid not null references public.exercises(id),
  set_no       int not null check (set_no > 0),
  position     int not null default 0,            -- 輸入順序，用來還原動作排列
  weight_kg    numeric(6,2) not null check (weight_kg >= 0),
  reps         int not null check (reps > 0),
  rpe          numeric(3,1) check (rpe between 6 and 10 and rpe * 2 = floor(rpe * 2)),
  created_at   timestamptz not null default now()
);
create index training_sets_session on public.training_sets (session_id);

-- ── 權限：客戶只能讀自己的；管理員全權；未登入無權限 ───────────────────────
alter table public.body_compositions enable row level security;
alter table public.exercises         enable row level security;
alter table public.training_sessions enable row level security;
alter table public.training_sets     enable row level security;

create policy body_compositions_select on public.body_compositions for select
  using (profile_id = auth.uid() or public.is_admin());
create policy body_compositions_admin on public.body_compositions for all
  using (public.is_admin()) with check (public.is_admin());

create policy exercises_select on public.exercises for select
  using (auth.role() = 'authenticated');
create policy exercises_admin on public.exercises for all
  using (public.is_admin()) with check (public.is_admin());

create policy training_sessions_select on public.training_sessions for select
  using (profile_id = auth.uid() or public.is_admin());
create policy training_sessions_admin on public.training_sessions for all
  using (public.is_admin()) with check (public.is_admin());

create policy training_sets_select on public.training_sets for select
  using (public.is_admin() or exists (
    select 1 from public.training_sessions s where s.id = session_id and s.profile_id = auth.uid()));
create policy training_sets_admin on public.training_sets for all
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.body_compositions, public.exercises,
  public.training_sessions, public.training_sets to authenticated, service_role;
