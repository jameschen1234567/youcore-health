-- 0036：熱量消耗（每日手機活動資料、上課分鐘）＋飲食與熱量功能「個別開放」
-- 計算在前端：基礎代謝 Mifflin-St Jeor 1990；運動 MET × 體重 × 時數（2024 Adult Compendium）。
-- 開放條件：會員（member_no）且管理員勾選 profiles.nutrition_enabled。

-- ── 個別開放（只有管理員能改） ─────────────────────────────────────────────
alter table public.profiles add column nutrition_enabled boolean not null default false;
grant update (nutrition_enabled) on public.profiles to authenticated;

create or replace function public.guard_nutrition_enabled()
returns trigger language plpgsql as $$
begin
  if new.nutrition_enabled is distinct from old.nutrition_enabled
     and current_user = 'authenticated' and not public.is_admin() then
    raise exception 'nutrition_enabled can only be changed by admin';
  end if;
  return new;
end $$;
create trigger profiles_nutrition_guard before update on public.profiles
  for each row execute function public.guard_nutrition_enabled();

create or replace function public.is_nutrition(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = uid and member_no is not null and nutrition_enabled) $$;

-- 飲食紀錄改成「會員＋已開放」才能新增／修改
drop policy food_logs_insert on public.food_logs;
drop policy food_logs_update on public.food_logs;
create policy food_logs_insert on public.food_logs for insert with check (
  profile_id = auth.uid() and public.is_nutrition() and eaten_on between public.taipei_today() - 7 and public.taipei_today());
create policy food_logs_update on public.food_logs for update
  using (profile_id = auth.uid() and public.is_nutrition())
  with check (profile_id = auth.uid() and public.is_nutrition() and eaten_on between public.taipei_today() - 7 and public.taipei_today());

-- ── 上課分鐘（教練填，算熱量用） ─────────────────────────────────────────
alter table public.training_sessions add column duration_min smallint check (duration_min between 10 and 300);

-- ── 每日手機活動資料（客人自己填） ───────────────────────────────────────
create table public.daily_activity (
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  day          date not null,
  steps        int check (steps between 0 and 100000),
  active_kcal  int check (active_kcal between 0 and 5000),
  updated_at   timestamptz not null default now(),
  primary key (profile_id, day),
  check (steps is not null or active_kcal is not null)
);
alter table public.daily_activity enable row level security;
create policy daily_activity_select on public.daily_activity for select using (profile_id = auth.uid() or public.is_admin());
create policy daily_activity_insert on public.daily_activity for insert with check (
  profile_id = auth.uid() and public.is_nutrition() and day between public.taipei_today() - 7 and public.taipei_today());
create policy daily_activity_update on public.daily_activity for update
  using (profile_id = auth.uid() and public.is_nutrition())
  with check (profile_id = auth.uid() and public.is_nutrition() and day between public.taipei_today() - 7 and public.taipei_today());
create policy daily_activity_delete on public.daily_activity for delete using (profile_id = auth.uid() or public.is_admin());
grant select, insert, update, delete on public.daily_activity to authenticated, service_role;

create or replace function public.daily_activity_touch()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger daily_activity_touch before update on public.daily_activity
  for each row execute function public.daily_activity_touch();
