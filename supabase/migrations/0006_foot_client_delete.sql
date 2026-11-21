-- 0006：客戶可在 24 小時內刪除自己的足部量測（點錯、拍錯時自行取消）
-- 超過 24 小時只能由管理員刪除（管理員本來就有 foot_measurements_admin 與 foot_photos_admin_delete 權限）。
-- 時間限制與 liff/src/lib/foot.js 的 CLIENT_DELETE_HOURS 一致。

create policy foot_measurements_delete_own on public.foot_measurements for delete
  using (profile_id = auth.uid() and created_at > now() - interval '24 hours');

create policy foot_photos_delete_own on storage.objects for delete
  using (bucket_id = 'foot-photos'
         and (storage.foldername(name))[1] = auth.uid()::text
         and created_at > now() - interval '24 hours');
