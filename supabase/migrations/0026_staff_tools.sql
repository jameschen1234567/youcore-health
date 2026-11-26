-- 0026 後台工具：VBT 速度與體態（只給管理員）
--   工具 HTML 放在私有 bucket「staff-tools」，只有管理員能讀寫；不放公開 repo 或 liff/public。
--   學員的速度與體態紀錄存在工作手機的瀏覽器（IndexedDB），不進資料庫。

insert into storage.buckets (id, name, public, file_size_limit)
values ('staff-tools', 'staff-tools', false, 5242880)
on conflict (id) do nothing;

create policy staff_tools_read on storage.objects for select to authenticated using (bucket_id = 'staff-tools' and public.is_admin());
create policy staff_tools_insert on storage.objects for insert to authenticated with check (bucket_id = 'staff-tools' and public.is_admin());
create policy staff_tools_update on storage.objects for update to authenticated using (bucket_id = 'staff-tools' and public.is_admin());
create policy staff_tools_delete on storage.objects for delete to authenticated using (bucket_id = 'staff-tools' and public.is_admin());
