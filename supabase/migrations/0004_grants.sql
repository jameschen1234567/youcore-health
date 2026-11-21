-- 0004：補上資料表權限
-- 新建的 Supabase 專案不再自動把 public 資料表授權給 API 角色，
-- 導致 Edge Functions（service_role）與登入後的使用者（authenticated）都無法讀寫。
-- 資料存取範圍仍由各表的 RLS policy 把關；anon（未登入）不給任何資料表權限。

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- 沿用 0001 的限制：使用者只能改 profiles 的 display_name、role（role 另有 trigger 擋非管理員）
revoke update on public.profiles from authenticated;
grant update (display_name, role) on public.profiles to authenticated;

-- 之後新增的表、序列、函式也自動套用
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema public grant execute on functions to authenticated, service_role;
