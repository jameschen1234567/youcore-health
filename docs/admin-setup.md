# 管理後台與取件推播設定

> 給 James：以下步驟只需要做一次。**所有金鑰、token 都不要貼到聊天或程式碼裡**，只貼在指定的後台欄位。

## 1. 把自己設成管理員

1. 先用自己的 LINE 打開 App 一次（完成登入與同意書），系統會自動建立你的帳號。
2. 到 Supabase Dashboard → **Table Editor → profiles**，找到你的那一列（display_name 是你的 LINE 名稱）。
3. 把 `role` 從 `client` 改成 `admin`，儲存。
4. 重新打開 App →「我的」頁面會出現 **進入管理後台** 按鈕。

> 權限是由資料庫把關的（RLS），客戶就算知道後台網址也讀不到其他人的資料。

## 2. 開通「可取件」LINE 推播

推播用的是**官方帳號的 Messaging API**，和登入用的 LINE Login 是不同的 channel。

1. LINE Official Account Manager → 設定 → **Messaging API** → 啟用（選擇與 LINE Login channel **同一個 Provider**）。
   - ⚠️ 一定要同一個 Provider，否則 App 拿到的客戶 ID 不能用來推播。
2. LINE Developers Console → 該 Messaging API channel →「Messaging API」分頁 → 最下方 **Channel access token (long-lived)** → Issue。
3. 把 token 存進 Supabase Secrets（終端機）：
   ```bash
   supabase secrets set LINE_MESSAGING_TOKEN=貼上token
   ```
4. 部署新的 Edge Functions：
   ```bash
   supabase functions deploy order-notify
   supabase functions deploy admin-delete-profile
   ```
5. 套用資料庫更新 `supabase/migrations/0003_orders_admin.sql`（`supabase db push`）。
   - 推播觸發器沿用里程碑 2 設定的 Vault secrets（project_url、anon_key、cron_secret），不用另外設定。

**費用提醒：** 官方帳號免費方案每月有固定則數的推播額度，所以我們只在「可取件」時推播一次。後台會顯示「已推播／尚未推播成功」，失敗可以按「重送」。

## 3. 後台功能一覽

| 功能 | 位置 |
|---|---|
| 客戶列表、搜尋、篩選（待刪除／製作中訂單） | 管理後台首頁 |
| 衛教內容「立即同步」 | 管理後台首頁 → 工具 |
| 全部足部量測匯出 CSV（Excel 可開） | 管理後台首頁 → 工具 |
| 建立訂單、推進狀態、加備註 | 客戶頁 → 訂單 |
| 足部量測紀錄、照片（10 分鐘有效連結）、單筆 CSV | 客戶頁 → 足部量測 |
| 量表分數與變化、疼痛地圖 | 客戶頁 |
| 處理刪除申請（輸入客戶名稱確認後永久刪除） | 客戶頁最上方 |

**刪除資料：** 會一起刪掉足部照片、量表、疼痛地圖、量測與訂單，**無法復原**。系統只保留「何時申請、何時刪除、刪了幾張照片」的匿名紀錄（`deletion_audit`），以備日後說明。

## 4. 本機預覽後台（不需要任何帳號）

在 `liff/.env.local` 設定：
```
VITE_DEMO=true
VITE_DEMO_ROLE=admin
```
然後 `npm run dev`。Demo 模式只有「體驗用戶」一位客戶，推播不會真的發送。
