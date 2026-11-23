-- 0011：課程包（堂數與到期日）— 只有管理員看得到，客戶端完全不顯示
--   每個課程包綁定一項服務，不能跨服務折抵
--   預約被標記「完成」時，自動從該客戶同服務、上課日仍有效、還有剩餘堂數的課程包扣 1 堂（最早到期的先扣）
--   從「完成」改回其他狀態時，自動退回那 1 堂
--   無故未到、24 小時內取消：不自動扣；管理員可手動「扣 1 堂／補 1 堂」並寫原因
--   到期後剩下的堂數：管理員可手動延期（改到期日）

create table public.packages (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  service_id  uuid not null references public.services(id),
  total       int  not null check (total between 1 and 500),
  starts_on   date not null default ((now() at time zone 'Asia/Taipei')::date),  -- 購買日（僅記錄）
  expires_on  date,                         -- null = 不限期
  note        text check (char_length(note) <= 200),
  created_at  timestamptz not null default now()
);
create index packages_profile_idx on public.packages (profile_id, service_id);

-- 用堂紀錄：amount 正數 = 扣堂，負數 = 補堂
create table public.package_usages (
  id          uuid primary key default gen_random_uuid(),
  package_id  uuid not null references public.packages(id) on delete cascade,
  booking_id  uuid unique references public.bookings(id) on delete set null,
  amount      int  not null check (amount <> 0 and amount between -50 and 50),
  kind        text not null check (kind in ('booking', 'manual')),
  note        text check (char_length(note) <= 200),
  created_at  timestamptz not null default now()
);
create index package_usages_package_idx on public.package_usages (package_id);

alter table public.packages enable row level security;
alter table public.package_usages enable row level security;
create policy packages_admin on public.packages for all using (public.is_admin()) with check (public.is_admin());
create policy package_usages_admin on public.package_usages for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.packages, public.package_usages to authenticated, service_role;

-- 完成 → 扣堂；完成改回 → 退堂
create or replace function public.package_on_complete()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pkg uuid;
  d date := (new.starts_at at time zone 'Asia/Taipei')::date;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select p.id into pkg
      from public.packages p
     where p.profile_id = new.profile_id and p.service_id = new.service_id
       and (p.expires_on is null or p.expires_on >= d)
       and p.total > coalesce((select sum(u.amount) from public.package_usages u where u.package_id = p.id), 0)
     order by p.expires_on nulls last, p.created_at
     limit 1
     for update;
    if pkg is not null then
      insert into public.package_usages (package_id, booking_id, amount, kind)
      values (pkg, new.id, 1, 'booking')
      on conflict (booking_id) do nothing;
    end if;
  elsif old.status = 'completed' and new.status is distinct from 'completed' then
    delete from public.package_usages where booking_id = new.id and kind = 'booking';
  end if;
  return new;
end;
$$;
revoke execute on function public.package_on_complete() from public, authenticated;

create trigger bookings_package after update of status on public.bookings
  for each row execute function public.package_on_complete();
