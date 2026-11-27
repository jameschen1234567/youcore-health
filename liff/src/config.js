// 全域設定。Demo 模式不需要任何帳號即可預覽。
export const DEMO = import.meta.env.VITE_DEMO === 'true'
// Demo 模式要預覽管理後台時設 VITE_DEMO_ROLE=admin
export const DEMO_ROLE = import.meta.env.VITE_DEMO_ROLE === 'admin' ? 'admin' : 'client'
export const LIFF_ID = import.meta.env.VITE_LIFF_ID
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// LINE 官方帳號 ID（含 @，例如 @youcore）。預約功能上線前，文末預約按鈕會導到官方帳號聊天
export const LINE_OA_ID = import.meta.env.VITE_LINE_OA_ID

// 線上預約對客人開放了沒；false 時只有管理員能進預約頁，客人改傳 LINE 預約（James 2026-11-26：先測試、跟客人說明再開）
export const BOOKING_OPEN = false

// 同意書版本：文字有改就要升版，所有客戶會被要求重新同意
export const CONSENT_VERSION = '2026-11-draft2' // 加入基本資料、病史、身體組成、訓練紀錄
