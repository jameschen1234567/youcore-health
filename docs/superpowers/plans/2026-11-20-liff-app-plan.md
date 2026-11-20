# YouCore LIFF 客戶 App｜實作計畫
**對應規格：** `docs/superpowers/specs/2026-11-20-liff-foot-content-design.md`
**日期：** 2026-11-20

> 本機沒有 Docker／Supabase CLI，資料庫 SQL 與 Edge Function 先寫好，等 James 建好 Supabase 專案後在雲端套用驗證。
> 前端提供 **Demo 模式**（`VITE_DEMO=true`），不需要任何帳號就能在瀏覽器預覽完整流程。

## 里程碑 1：骨架（本次）
- [x] 1.1 建立 `liff/`（React + Vite + react-router），`.env.example`，`.gitignore`
- [x] 1.2 `supabase/migrations/0001_init.sql`：規格第四節全部資料表、RLS、`is_admin()`、Storage bucket 與政策
- [x] 1.3 `supabase/functions/line-auth`：驗證 LINE ID token → 建立／取得 auth user 與 profile → 回傳 magic link token_hash，前端 `verifyOtp` 換 session
- [x] 1.4 前端 `auth/`：`AuthProvider`（LIFF 初始化 → line-auth → Supabase session；Demo 模式走假身份）
- [x] 1.5 同意書頁（版本號 `CONSENT_VERSION`，未同意不得進入 App）
- [x] 1.6 App 外殼：底部分頁「內容／量表／足部／我的」，各頁先放佔位
- [x] 1.7 `npm run build` 通過、Demo 模式瀏覽器實測、commit

## 里程碑 2：衛教內容
- [x] 2.1 Notion 資料庫欄位建立說明（給 James）
- [x] 2.2 `supabase/functions/notion-sync`：抓發布頁面 → 轉存 blocks 與圖片 → upsert `content_items` → 移除下架 → 寫 `sync_logs`
- [x] 2.3 pg_cron 每小時呼叫（「立即同步」按鈕併入里程碑 5 管理後台）
- [x] 2.4 前端內容列表（分類篩選）、文章頁（Notion blocks 渲染）、短影音嵌入、「關於宥芯」
- [x] 2.5 Demo 模式假資料

## 里程碑 3：量表
- [ ] 3.1 量表設定檔 JSON schema、共用計分模組＋單元測試（vitest）
- [ ] 3.2 NRS、身體疼痛地圖（SVG 分區）
- [ ] 3.3 FFI-TC 佔位設定檔（**正式題目取得前禁止部署**）
- [ ] 3.4 結果頁、趨勢圖、回測提醒

## 里程碑 4：足部 A1
- [ ] 4.1 `backend/foot_measure.py` 演算法＋pytest（合成測試圖＋實拍標記圖）
- [ ] 4.2 `backend/routers/foot_router.py`：`POST /foot/measure`、Supabase JWT 驗證、大小與頻率限制
- [ ] 4.3 前端拍照教學、上傳、錯誤提示、報告頁
- [ ] 4.4 James／Nicole 準確度驗收（≤ 5 mm）

## 里程碑 5：訂單與後台
- [ ] 5.1 訂單狀態、`order_events`、`ready` 時 LINE 推播
- [ ] 5.2 管理後台：客戶列表、量表與疼痛地圖、照片、訂單、刪除申請、CSV 匯出
