# 線上預約 設計（2026-11-23）

## 目標
客戶在 LINE（LIFF App）看到已被預約／關閉的時段並自行預約；James 在後台管理。

## 已確認的規則
| 項目 | 決定 |
|------|------|
| 成立方式 | 送出即成立，LINE 同時通知客戶與管理員 |
| 可預約時段 | 營業時間全開放（週二至週日 10:00–20:30，週一公休），管理員關閉不行的時段 |
| 開始時間 | 每 30 分一格；服務結束不得晚於 20:30 |
| 時長 | 運動按摩 60、肌力與體能課程 60、康復訓練 90，各加 10 分緩衝（緩衝不可被別人預約） |
| 暫不開放線上預約 | 專業健康檢測、頌缽療育（後台可改為開放並設定時長） |
| 最晚預約 | 開始前 3 小時；最遠 30 天內 |
| 改期／取消 | 開始前 24 小時之前可在 App 自行改期或取消；24 小時內只能傳訊息由 James 處理 |
| 未到 | 管理員標記「無故未到」；累計 3 次停權線上預約，管理員可「恢復預約權限」（重新計算） |
| 防佔位 | 每位客戶同時最多 4 筆未來預約（自行加的保護） |

## 資料（migration 0008）
- `services`：name、duration_min、buffer_min（10）、bookable、sort_order
- `bookings`：profile_id、service_id、starts_at、ends_at（服務結束）、block_until（含緩衝）、status（booked/cancelled/completed/no_show）、cancelled_by、note
  - 排除約束：status='booked' 的 `[starts_at, block_until)` 不可重疊 → 資料庫層防重複預約
- `blocked_times`：管理員關閉的時段
- `profiles.booking_reset_at`：恢復權限的時間，只計算之後的未到次數

## 權限
- 客戶不能直接寫 bookings，只能透過 RPC：`create_booking`、`reschedule_booking`、`cancel_booking`（security definer，檢查所有規則）
- `get_busy(from, to)`：回傳被佔用的時間區間（不含姓名），所有登入者可呼叫
- 管理員：表格全權（RLS）＋`create_booking` 可代客預約（略過營業時間／提前量／停權限制，但仍不可重疊）＋`admin_reset_no_show`

## 通知
`bookings` 新增、改期、取消時，trigger 經 pg_net 呼叫 Edge Function `booking-notify`（帶 x-cron-secret），推播給客戶與所有管理員。完成／未到不推播。

## 畫面
- 客戶 `/booking`：選服務 → 選日期（30 天，週一不可選）→ 選時段（已佔用顯示灰色「已預約」）→ 確認頁顯示規則並勾選同意 → 送出
- 客戶 `/booking/mine`：我的預約；超過 24 小時前顯示「改期／取消」，否則顯示「傳訊息修改」
- 入口：圖文選單「立即預約」改連 `/booking`；「我的」頁加入口
- 後台 `/admin/bookings`：依日檢視、標記完成／未到、取消、代客預約、關閉時段、服務時長設定
- 後台客戶頁：該客戶預約紀錄、未到次數、恢復預約權限

## 測試
- 純函式（時段產生、可否改期、營業時間）以 vitest 測
- 資料庫規則以 rollback 模擬（SIM_RESULT）驗證：重疊、24 小時、3 小時、停權、他人預約不可改
