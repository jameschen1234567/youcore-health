-- 0020：互動模擬教室（肌動學、肌肉骨骼模擬）
--   教材 HTML 放在私有 bucket「learning」，只有效期內的客戶與管理員能下載（不放公開 repo）
--   權限由管理員以「月」開通；再次開通會從目前到期日的隔天接續

create table public.learning_modules (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 60),
  summary    text check (char_length(summary) <= 300),
  path       text not null unique check (path ~ '^[A-Za-z0-9._-]{1,100}$'),
  sort       int  not null default 0,
  published  boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.learning_grants (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  months      int  not null check (months between 1 and 36),
  starts_on   date not null,
  expires_on  date not null check (expires_on >= starts_on),  -- 含當天
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index learning_grants_profile_idx on public.learning_grants (profile_id, expires_on);

create or replace function public.has_learning_access()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.learning_grants
     where profile_id = auth.uid() and revoked_at is null
       and (now() at time zone 'Asia/Taipei')::date between starts_on and expires_on);
$$;
revoke execute on function public.has_learning_access() from public, anon;
grant execute on function public.has_learning_access() to authenticated;

alter table public.learning_modules enable row level security;
alter table public.learning_grants enable row level security;
create policy learning_modules_select on public.learning_modules for select using (published or public.is_admin());
create policy learning_modules_admin on public.learning_modules for all using (public.is_admin()) with check (public.is_admin());
create policy learning_grants_select on public.learning_grants for select using (profile_id = auth.uid() or public.is_admin());
revoke all on public.learning_modules, public.learning_grants from anon;
revoke insert, update, delete on public.learning_grants from authenticated;  -- 只能經由下面的 RPC
grant select, insert, update, delete on public.learning_modules to authenticated;
grant select on public.learning_grants to authenticated;
grant all on public.learning_modules, public.learning_grants to service_role;

create or replace function public.grant_learning(p_profile uuid, p_months int, p_start date default null)
returns public.learning_grants language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Taipei')::date; cur date; s date; g public.learning_grants;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_months is null or p_months not between 1 and 36 then raise exception 'BAD_MONTHS'; end if;
  perform 1 from public.profiles where id = p_profile for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select max(expires_on) into cur from public.learning_grants
   where profile_id = p_profile and revoked_at is null and expires_on >= today;
  s := coalesce(p_start, greatest(today, coalesce(cur + 1, today)));
  if cur is not null and s <= cur then raise exception 'OVERLAP'; end if;
  insert into public.learning_grants (profile_id, months, starts_on, expires_on)
  values (p_profile, p_months, s, (s + make_interval(months => p_months))::date - 1) returning * into g;
  return g;
end;
$$;

-- 停用：這位客戶目前與之後的所有權限
create or replace function public.revoke_learning(p_profile uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update public.learning_grants set revoked_at = now()
   where profile_id = p_profile and revoked_at is null and expires_on >= (now() at time zone 'Asia/Taipei')::date;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.grant_learning(uuid, int, date), public.revoke_learning(uuid) from public, anon;
grant execute on function public.grant_learning(uuid, int, date), public.revoke_learning(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit) values ('learning', 'learning', false, 5242880)
on conflict (id) do nothing;
create policy learning_read on storage.objects for select to authenticated using (bucket_id = 'learning' and public.has_learning_access());
create policy learning_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'learning' and public.is_admin());
create policy learning_admin_update on storage.objects for update to authenticated using (bucket_id = 'learning' and public.is_admin());
create policy learning_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'learning' and public.is_admin());

insert into public.learning_modules (title, summary, path, sort, published)
values ('深蹲代償鏈 3D 模擬', '拉滑桿看看踝、髖、骨盆、肩胸的限制，怎麼一節一節影響深蹲動作與肌肉負荷。共四章。', 'squat-course.html', 1, true);
