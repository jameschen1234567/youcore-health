-- 0005：角色保護只針對 App 使用者
-- 原本的 trigger 在 Dashboard（Table Editor／SQL Editor）修改時也會擋，
-- 因為那時沒有登入身份，is_admin() 一定是 false，導致無法照 admin-setup.md 設定第一位管理員。
-- 改成：只有透過 App 登入的使用者（authenticated）改 role 時才檢查是否為管理員。

create or replace function public.prevent_role_change()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role
     and current_user = 'authenticated'
     and not public.is_admin() then
    raise exception 'role can only be changed by admin';
  end if;
  return new;
end $$;
