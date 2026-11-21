-- 里程碑 5：訂單推播與管理後台
-- 對應規格第四、八、九節

-- ── 1. 訂單「可取件」推播 ───────────────────────────────────────────────────
-- notified_at：已推播時間，避免重複推播（狀態來回切換也只推一次）
alter table public.orders add column notified_at timestamptz;

-- 狀態變成 ready 時，呼叫 Edge Function order-notify（沿用 0002 的 Vault secrets）
create or replace function public.notify_order_ready()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ready' and old.status is distinct from 'ready' and new.notified_at is null then
    perform net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/order-notify',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body    := jsonb_build_object('order_id', new.id)
    );
  end if;
  return null;
end $$;

create trigger orders_notify_ready after update of status on public.orders
  for each row execute function public.notify_order_ready();

-- ── 2. 刪除申請處理紀錄 ─────────────────────────────────────────────────────
-- 刪除客戶時 profiles 連帶刪除所有個資（含 deletion_requests），
-- 這裡只留下「何時申請、何時刪除」的紀錄，不含任何可識別個人的資料。
create table public.deletion_audit (
  id            uuid primary key default gen_random_uuid(),
  requested_at  timestamptz,
  processed_at  timestamptz not null default now(),
  photos_removed int not null default 0
);
alter table public.deletion_audit enable row level security;
create policy deletion_audit_admin on public.deletion_audit for select
  using (public.is_admin());

-- 刪除申請：admin 可標記為 rejected（例如重複申請）
-- （既有 deletion_requests_admin 政策已涵蓋 admin 全權）
