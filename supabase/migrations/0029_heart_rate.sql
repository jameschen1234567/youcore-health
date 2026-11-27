-- 0029：訓練紀錄加心率（平均／最高／當天安靜心跳），客戶每天自己填安靜心跳
-- 強度區間在前端用 Karvonen 法推估（最大心率 = 208 − 0.7 × 年齡），資料庫只存原始數字。

-- ── 訓練紀錄的心率欄位（教練填） ───────────────────────────────────────────
alter table public.training_sessions
  add column rest_hr smallint check (rest_hr between 30 and 120),
  add column avg_hr  smallint check (avg_hr between 40 and 230),
  add column max_hr  smallint check (max_hr between 40 and 230),
  add constraint training_sessions_hr_order check (max_hr is null or avg_hr is null or max_hr >= avg_hr);

-- ── 每日安靜心跳（客戶自己填，一天一筆） ─────────────────────────────────────
create table public.resting_hr (
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  measured_on  date not null,
  bpm          smallint not null check (bpm between 30 and 120),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (profile_id, measured_on)
);

alter table public.resting_hr enable row level security;

create policy resting_hr_select on public.resting_hr for select
  using (profile_id = auth.uid() or public.is_admin());

-- 客戶只能填／改自己近 7 天內的紀錄，不能填未來日期
create policy resting_hr_insert on public.resting_hr for insert
  with check (public.is_admin() or (profile_id = auth.uid()
    and measured_on <= (now() at time zone 'Asia/Taipei')::date
    and measured_on >= (now() at time zone 'Asia/Taipei')::date - 7));
create policy resting_hr_update on public.resting_hr for update
  using (profile_id = auth.uid() or public.is_admin())
  with check (public.is_admin() or (profile_id = auth.uid()
    and measured_on <= (now() at time zone 'Asia/Taipei')::date
    and measured_on >= (now() at time zone 'Asia/Taipei')::date - 7));
create policy resting_hr_delete on public.resting_hr for delete
  using (profile_id = auth.uid() or public.is_admin());

create or replace function public.resting_hr_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger resting_hr_touch before update on public.resting_hr
  for each row execute function public.resting_hr_touch();

grant select, insert, update, delete on public.resting_hr to authenticated, service_role;
