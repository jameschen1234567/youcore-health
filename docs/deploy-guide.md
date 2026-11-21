# 部署上線指南（內部測試版）

> 目標：先讓 **James、Nicole** 在自己的 LINE 裡用到真的 App。
> 正式開放給客戶前，還需要：同意書定稿、FFI-TC 授權與正式題目、足部量測實拍驗收（≤ 5 mm）。
>
> 🔒 原則：所有金鑰、密碼、token 只貼在各平台的後台欄位或你自己的終端機，**不要貼到聊天或程式碼**（GitHub repo 是公開的）。

## 部署順序總覽

| 步驟 | 平台 | 做什麼 | 約需時間 |
|---|---|---|---|
| 0 | GitHub | 推送最新程式碼 | 1 分鐘 |
| 1 | Supabase | 建專案、建資料表、設定密鑰、部署 Edge Functions | 20 分鐘 |
| 2 | LINE Developers | 建 LINE Login channel（開發中模式） | 10 分鐘 |
| 3 | Vercel | 部署 App 前端，拿到網址 | 10 分鐘 |
| 4 | LINE Developers | 建 LIFF app（填入 Vercel 網址），把 LIFF ID 填回 Vercel | 5 分鐘 |
| 5 | Render | 設定環境變數，更新足部量測 API | 10 分鐘 |
| 6 | Notion | 建內容資料庫與 integration（見 `docs/notion-setup.md`） | 15 分鐘 |
| 7 | Supabase／LINE | 設自己為管理員、開通取件推播（見 `docs/admin-setup.md`） | 15 分鐘 |
| 8 | 手機 | iPhone、Android 實機走一遍 | 20 分鐘 |

---

## 步驟 1：Supabase

### 1-1 建立專案
1. 到 https://supabase.com 登入 → **New project**
2. Name：`youcore-liff`；Region：**Northeast Asia (Tokyo)**（離台灣近）
3. Database Password：按 Generate，**存到你的密碼管理器**（等一下終端機會問）
4. 建好後到 **Project Settings → API**，記下（之後要填到 Vercel）：
   - Project URL（`https://xxxx.supabase.co`）
   - Project ref（網址中間那串 `xxxx`）
   - anon／publishable key

### 1-2 建立資料表（在你自己的終端機執行）
```bash
cd C:\Users\陳柏穎\youcore-health-repo
npx supabase login
npx supabase link --project-ref 你的ProjectRef
npx supabase db push
```
- `link` 會問資料庫密碼，貼上 1-1 存的那組。
- `db push` 會依序套用 `0001`、`0002`、`0003` 三個 migration。

✅ 檢查：Dashboard → Table Editor 看得到 `profiles`、`orders`、`content_items` 等表。

### 1-3 排程與推播用的 Vault 密鑰（Dashboard → SQL Editor 執行）
```sql
select vault.create_secret('https://你的ProjectRef.supabase.co', 'project_url');
select vault.create_secret('你的anon或publishable key', 'anon_key');
select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'cron_secret');
-- 查出剛產生的 cron_secret，下一步要用（只在你自己的畫面看，不要貼給別人）
select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret';
```

### 1-4 Edge Functions 密鑰與部署（終端機）
```bash
npx supabase secrets set CRON_SECRET=上一步查到的值
npx supabase functions deploy line-auth --no-verify-jwt
npx supabase functions deploy notion-sync --no-verify-jwt
npx supabase functions deploy order-notify --no-verify-jwt
npx supabase functions deploy admin-delete-profile --no-verify-jwt
```
- `--no-verify-jwt`：這幾個函式都自己做驗證（LINE token、cron 密碼或管理員身份），不經過平台預設檢查。
- `LINE_CHANNEL_ID`、`NOTION_*`、`LINE_MESSAGING_TOKEN` 在後面步驟拿到後再設定。

---

## 步驟 2：LINE Login channel

1. https://developers.line.biz/console/ → 選你的 Provider（沒有就建一個，例如「宥芯健康顧問」）
   - ⚠️ 之後官方帳號的 Messaging API 也要在**同一個 Provider**，推播才會通。
2. **Create a new channel → LINE Login**
   - App types：勾 **Web app**
   - Channel name：宥芯健筋療育所
3. 建好後先**保持「Developing」狀態**：只有你加入的測試人員能登入，客戶進不來，最適合內部測試。
   - Roles 分頁 → 邀請 Nicole 為 Tester。
4. Basic settings 分頁 → 記下 **Channel ID**，然後在終端機：
```bash
npx supabase secrets set LINE_CHANNEL_ID=你的ChannelID
```

---

## 步驟 3：Vercel 部署前端

1. https://vercel.com 用 GitHub 登入 → **Add New → Project** → 匯入 `youcore-health`
2. 設定：
   - **Root Directory：`liff`**
   - Framework Preset：Vite（自動偵測）
3. Environment Variables：

| 名稱 | 值 |
|---|---|
| `VITE_DEMO` | `false` |
| `VITE_SUPABASE_URL` | 1-1 的 Project URL |
| `VITE_SUPABASE_ANON_KEY` | 1-1 的 anon／publishable key |
| `VITE_LINE_OA_ID` | 官方帳號 ID（含 @） |
| `VITE_FOOT_API_URL` | Render 服務網址，例如 `https://youcore-motion-api.onrender.com` |
| `VITE_LIFF_ID` | 先留空，步驟 4 回填 |

4. Deploy → 記下網址（例如 `https://youcore-liff.vercel.app`）。

> anon key 本來就會出現在前端，安全靠資料庫的 RLS；**service role key 絕對不能填到 Vercel**。

---

## 步驟 4：LIFF app

1. LINE Login channel → **LIFF** 分頁 → Add
   - Size：**Full**
   - Endpoint URL：步驟 3 的 Vercel 網址
   - Scopes：勾 `openid`、`profile`
   - Bot link feature：On (Normal)（之後官方帳號可引導加好友）
2. 記下 **LIFF ID** → 回 Vercel → Settings → Environment Variables → 填 `VITE_LIFF_ID` → **Redeploy**。
3. LIFF URL（`https://liff.line.me/你的LIFFID`）就是 App 入口，之後可放進官方帳號圖文選單。

---

## 步驟 5：Render（足部量測 API）

1. Render Dashboard → `youcore-motion-api` → **Environment**，新增：

| 名稱 | 值 |
|---|---|
| `SUPABASE_URL` | 1-1 的 Project URL |
| `JWT_SECRET_KEY` | 按 Generate 產生亂數（動作分析系統用，**沒設定服務會拒絕啟動**） |

2. 儲存後觸發重新部署（若有連 GitHub 自動部署，步驟 0 推送後就會自動更新）。
3. ✅ 檢查：打開 `https://你的服務網址/health` 有回應；`/docs` 看得到 `POST /foot/measure`。

> 更換 `JWT_SECRET_KEY` 後，動作分析系統現有的登入會失效，大家重新登入一次即可。

---

## 步驟 6、7

- Notion：照 `docs/notion-setup.md`，最後在終端機：
  ```bash
  npx supabase secrets set NOTION_TOKEN=你的token NOTION_DATABASE_ID=你的資料庫ID
  ```
- 管理員與推播：照 `docs/admin-setup.md`。

---

## 步驟 8：實機測試清單

在 iPhone 和 Android 的 LINE 裡打開 LIFF URL，各走一遍：

- [ ] 第一次開啟 → LINE 授權 → 同意書 → 進入首頁
- [ ] 衛教：Notion 發布的文章、短影音出現；圖片正常
- [ ] 量表：NRS、疼痛地圖填寫 → 紀錄頁
- [ ] 足部：拍照 → 量測結果合理 → 報告頁
- [ ] 我的：足型報告摘要
- [ ] 後台：建立訂單 → 改成「可取件」→ **手機收到 LINE 推播**
- [ ] 後台：看得到足部照片、匯出 CSV 用 Excel 開啟正常
- [ ] 關掉 App 再開，不用重新登入

## 出問題時看哪裡

| 症狀 | 查看 |
|---|---|
| 一直卡在「登入失敗」 | Supabase → Edge Functions → line-auth → Logs；確認 `LINE_CHANNEL_ID`、帳號是 Tester |
| 足部量測「登入已過期」 | Render Logs；確認 `SUPABASE_URL` 有設 |
| 足部量測「連線失敗」 | Vercel 的 `VITE_FOOT_API_URL` 是否正確；Render 服務是否在跑 |
| 衛教是空的 | 後台按「立即同步」；看 sync_logs 的錯誤訊息 |
| 沒收到推播 | Supabase → order-notify Logs；Messaging API 與 Login channel 是否同一 Provider |
