-- 0019：足型自評（量腳＋足弓＋鞋墊一次完成），產生初步報告
--   原始輸入（data）與前端計算結果（result）都保留；後台會用目前模型重新計算
--   刪除一筆自評會連同該次的足部與鞋墊尺寸一起刪除

create table public.foot_assessments (
  id            uuid primary key,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  data          jsonb not null check (pg_column_size(data) < 20000),
  result        jsonb not null check (pg_column_size(result) < 20000),
  photo_left    text,
  photo_right   text,
  algo_version  text not null check (char_length(algo_version) <= 20),
  created_at    timestamptz not null default now(),
  constraint photo_owner check (
    (photo_left  is null or photo_left  = profile_id::text || '/' || id::text || '/left.jpg') and
    (photo_right is null or photo_right = profile_id::text || '/' || id::text || '/right.jpg'))
);
create index foot_assessments_profile_idx on public.foot_assessments (profile_id, created_at);

alter table public.foot_assessments enable row level security;
create policy foot_assessments_select on public.foot_assessments for select
  using (profile_id = auth.uid() or public.is_admin());
create policy foot_assessments_insert on public.foot_assessments for insert
  with check (profile_id = auth.uid());
create policy foot_assessments_delete_own on public.foot_assessments for delete
  using (profile_id = auth.uid() and created_at > now() - interval '24 hours');
create policy foot_assessments_admin_delete on public.foot_assessments for delete using (public.is_admin());
revoke all on public.foot_assessments from anon, authenticated;
grant select, insert, delete on public.foot_assessments to authenticated;
grant all on public.foot_assessments to service_role;

alter table public.foot_measurements
  add column ball_length_mm    numeric(5,1) check (ball_length_mm > 0 and ball_length_mm < length_mm),
  add column widths            jsonb check (widths is null or public.valid_insole_widths(widths, length_mm)),
  add column arch_clearance_mm numeric(4,1) check (arch_clearance_mm between 0 and 60),
  add column assessment_id     uuid references public.foot_assessments(id) on delete cascade;
alter table public.insole_measurements
  add column assessment_id     uuid references public.foot_assessments(id) on delete cascade;
create index foot_measurements_assessment_idx on public.foot_measurements (assessment_id);
create index insole_measurements_assessment_idx on public.insole_measurements (assessment_id);

-- 一次寫入三張表（任何一項不合規則就全部不寫）；以呼叫者身分執行，RLS 照常把關
create or replace function public.submit_foot_assessment(
  p_id uuid, p_feet jsonb, p_insole jsonb, p_data jsonb, p_result jsonb, p_algo text,
  p_photo_left text default null, p_photo_right text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare f jsonb; me uuid := auth.uid();
begin
  if me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if jsonb_typeof(p_feet) <> 'array' or jsonb_array_length(p_feet) <> 2 or (p_feet->0->>'side') = (p_feet->1->>'side')
     or p_insole is null or jsonb_typeof(p_insole) <> 'object' then raise exception 'INCOMPLETE'; end if;
  if (select count(*) from public.foot_assessments where profile_id = me and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'TOO_MANY';
  end if;
  insert into public.foot_assessments (id, profile_id, data, result, algo_version, photo_left, photo_right)
  values (p_id, me, p_data, p_result, p_algo, p_photo_left, p_photo_right);
  for f in select * from jsonb_array_elements(p_feet) loop
    insert into public.foot_measurements
      (profile_id, side, length_mm, ball_length_mm, width_mm, heel_width_mm, widths, arch_clearance_mm, algo_version, quality_flags, source, assessment_id)
    values (me, f->>'side', (f->>'length_mm')::numeric, (f->>'ball_length_mm')::numeric, (f->>'width_mm')::numeric,
            (f->>'heel_width_mm')::numeric, f->'widths', (f->>'arch_clearance_mm')::numeric, p_algo, '[]', 'self', p_id);
  end loop;
  insert into public.insole_measurements (profile_id, side, length_mm, widths, note, source, assessment_id)
  values (me, p_insole->>'side', (p_insole->>'length_mm')::numeric, p_insole->'widths', p_insole->>'note', 'self', p_id);
  return p_id;
end;
$$;
revoke execute on function public.submit_foot_assessment(uuid, jsonb, jsonb, jsonb, jsonb, text, text, text) from public, anon;
grant execute on function public.submit_foot_assessment(uuid, jsonb, jsonb, jsonb, jsonb, text, text, text) to authenticated;
