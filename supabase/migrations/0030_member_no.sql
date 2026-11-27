-- 0030：會員編號（先由管理員手動輸入；客戶只能看不能改）
alter table public.profiles
  add column member_no text check (member_no ~ '^[A-Za-z0-9-]{1,20}$');

-- 不分大小寫不可重複
create unique index profiles_member_no_unique on public.profiles (upper(member_no)) where member_no is not null;

grant update (member_no) on public.profiles to authenticated;

-- 只有管理員能填／改會員編號
create or replace function public.prevent_member_no_change()
returns trigger language plpgsql as $$
begin
  if new.member_no is distinct from old.member_no
     and current_user = 'authenticated'
     and not public.is_admin() then
    raise exception 'member_no can only be changed by admin';
  end if;
  return new;
end $$;

create trigger profiles_member_no_guard before update on public.profiles
  for each row execute function public.prevent_member_no_change();
