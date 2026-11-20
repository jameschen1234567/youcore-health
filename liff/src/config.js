// 全域設定。Demo 模式不需要任何帳號即可預覽。
export const DEMO = import.meta.env.VITE_DEMO === 'true'
export const LIFF_ID = import.meta.env.VITE_LIFF_ID
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// LINE 官方帳號 ID（含 @，例如 @youcore）。預約功能上線前，文末預約按鈕會導到官方帳號聊天
export const LINE_OA_ID = import.meta.env.VITE_LINE_OA_ID

// 同意書版本：文字有改就要升版，所有客戶會被要求重新同意
export const CONSENT_VERSION = '2026-11-draft'
