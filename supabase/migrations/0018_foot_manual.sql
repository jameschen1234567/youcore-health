-- 0018：足部改為手動量測（尺量），並新增鞋墊尺寸
--   source：self 客戶自己量、onsite 到店量（只有管理員能寫）、photo 舊的拍照量測
--   鞋墊寬度 widths：[[距腳跟 mm, 寬度 mm], …]，格式與「YouCore 鞋墊製作」桌面 App 相同

alter table public.foot_measurements
  add column heel_width_mm numeric(5,1) check (heel_width_mm between 30 and 120),
  add column source text not null default 'photo' check (source in ('self', 'onsite', 'photo'));
alter table public.foot_measurements alter column source set default 'self';
alter table public.foot_measurements
  add constraint foot_length_range check (source = 'photo' or length_mm between 150 and 350),
  add constraint foot_width_range  check (source = 'photo' or width_mm between 50 and 160);

drop policy foot_measurements_insert on public.foot_measurements;
create policy foot_measurements_insert on public.foot_measurements for insert
  with check (profile_id = auth.uid() and source = 'self');
drop policy foot_measurements_delete_own on public.foot_measurements;
create policy foot_measurements_delete_own on public.foot_measurements for delete
  using (profile_id = auth.uid() and source <> 'onsite' and created_at > now() - interval '24 hours');

-- 寬度點：4–12 點、位置遞增且在鞋墊長度內、寬度 20–160 mm
create or replace function public.valid_insole_widths(w jsonb, len numeric)
returns boolean language plpgsql immutable set search_path = public as $$
declare p jsonb; prev numeric := 0;
begin
  if w is null or jsonb_typeof(w) <> 'array' or jsonb_array_length(w) not between 4 and 12 then return false; end if;
  for p in select * from jsonb_array_elements(w) loop
    if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 2
       or jsonb_typeof(p->0) <> 'number' or jsonb_typeof(p->1) <> 'number' then return false; end if;
    if (p->>0)::numeric <= prev or (p->>0)::numeric >= len then return false; end if;
    if (p->>1)::numeric not between 20 and 160 then return false; end if;
    prev := (p->>0)::numeric;
  end loop;
  return true;
end;
$$;

create table public.insole_measurements (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  side        text not null check (side in ('left', 'right', 'both')),
  length_mm   numeric(5,1) not null check (length_mm between 150 and 350),
  widths      jsonb not null,
  note        text check (char_length(note) <= 100),
  source      text not null default 'self' check (source in ('self', 'onsite')),
  created_at  timestamptz not null default now(),
  constraint insole_widths_valid check (public.valid_insole_widths(widths, length_mm))
);
create index insole_measurements_profile_idx on public.insole_measurements (profile_id, created_at);

alter table public.insole_measurements enable row level security;
create policy insole_select on public.insole_measurements for select
  using (profile_id = auth.uid() or public.is_admin());
create policy insole_insert on public.insole_measurements for insert
  with check (profile_id = auth.uid() and source = 'self');
create policy insole_delete_own on public.insole_measurements for delete
  using (profile_id = auth.uid() and source = 'self' and created_at > now() - interval '24 hours');
create policy insole_admin on public.insole_measurements for all
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.insole_measurements from anon;
grant select, insert, update, delete on public.insole_measurements to authenticated, service_role;
