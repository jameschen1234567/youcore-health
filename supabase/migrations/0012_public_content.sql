-- 0012：衛教內容公開瀏覽（免登入）
--   文章、短影音、關於宥芯本來就是要給大家看的，開放 anon 讀取，方便分享給還不是會員的朋友
--   寫入仍只有 Edge Function（service role）
drop policy if exists content_select on public.content_items;
create policy content_select on public.content_items for select using (true);
grant select on public.content_items to anon;
