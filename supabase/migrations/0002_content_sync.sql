-- 里程碑 2：Notion 內容同步
-- 1) 記錄 Notion 最後編輯時間，沒改過的頁面不重抓
alter table public.content_items add column notion_edited_at timestamptz;

-- 2) 每小時呼叫 notion-sync
--    套用前先在 Supabase Dashboard → Project Settings → Vault 新增三個 secret：
--      project_url  = https://<project-ref>.supabase.co
--      cron_secret  = 與 Edge Function 的 CRON_SECRET 相同的值
--      anon_key     = 專案的 anon（publishable）key
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'notion-sync-hourly',
  '5 * * * *',  -- 每小時第 5 分
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/notion-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
