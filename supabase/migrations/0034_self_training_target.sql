-- 0034：客人自主訓練紀錄（簡單版＋重訓可加組數）與目標體重（會員限定）
-- 訓練量用 session-RPE（Foster 2001）：時間（分）× 自覺強度 RPE（1–10），由前端計算。

-- ── 目標體重（存在 profiles；會員本人或管理員可改） ─────────────────────────
alter table public.profiles
  add column target_weight_kg numeric(5,1) check (target_weight_kg between 30 and 250),
  add column target_date      date;
grant update (target_weight_kg, target_date) on public.profiles to authenticated;

create or replace function public.guard_target_weight()
returns trigger language plpgsql as $$
begin
  if (new.target_weight_kg is distinct from old.target_weight_kg or new.target_date is distinct from old.target_date)
     and current_user = 'authenticated' and not (public.is_admin() or public.is_member()) then
    raise exception 'target weight is for members only';
  end if;
  return new;
end $$;
create trigger profiles_target_guard before update on public.profiles
  for each row execute function public.guard_target_weight();

-- ── 自主訓練 ─────────────────────────────────────────────────────────────
create table public.self_workouts (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  done_on       date not null,
  kind          text not null check (kind in ('strength', 'run', 'walk', 'bike', 'swim', 'yoga', 'ball', 'other')),
  duration_min  int  not null check (duration_min between 1 and 600),
  rpe           int  not null check (rpe between 1 and 10),
  note          text check (char_length(note) <= 200),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index self_workouts_profile on public.self_workouts (profile_id, done_on);

create table public.self_workout_sets (
  id           uuid primary key default gen_random_uuid(),
  workout_id   uuid not null references public.self_workouts(id) on delete cascade,
  exercise_id  uuid not null references public.exercises(id),
  set_no       int  not null check (set_no > 0),
  position     int  not null default 0,
  weight_kg    numeric(6,2) not null check (weight_kg between 0 and 1000),
  reps         int  not null check (reps between 1 and 100)
);
create index self_workout_sets_workout on public.self_workout_sets (workout_id);

alter table public.self_workouts     enable row level security;
alter table public.self_workout_sets enable row level security;

-- 本人：會員、日期在今天往前 30 天內
create policy self_workouts_select on public.self_workouts for select using (profile_id = auth.uid() or public.is_admin());
create policy self_workouts_insert on public.self_workouts for insert with check (
  profile_id = auth.uid() and public.is_member()
  and done_on between public.taipei_today() - 30 and public.taipei_today());
create policy self_workouts_update on public.self_workouts for update
  using (profile_id = auth.uid() and public.is_member())
  with check (profile_id = auth.uid() and public.is_member()
    and done_on between public.taipei_today() - 30 and public.taipei_today());
create policy self_workouts_delete on public.self_workouts for delete using (profile_id = auth.uid() or public.is_admin());

create policy self_sets_select on public.self_workout_sets for select using (
  public.is_admin() or exists (select 1 from public.self_workouts w where w.id = workout_id and w.profile_id = auth.uid()));
create policy self_sets_insert on public.self_workout_sets for insert with check (
  public.is_member() and exists (select 1 from public.self_workouts w where w.id = workout_id and w.profile_id = auth.uid()));
create policy self_sets_delete on public.self_workout_sets for delete using (
  exists (select 1 from public.self_workouts w where w.id = workout_id and w.profile_id = auth.uid()));

grant select, insert, update, delete on public.self_workouts, public.self_workout_sets to authenticated, service_role;

create or replace function public.self_workouts_touch()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger self_workouts_touch before update on public.self_workouts
  for each row execute function public.self_workouts_touch();
