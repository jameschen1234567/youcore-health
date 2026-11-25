// 會員意見回饋（對話串）。規則見 supabase/migrations/0022_feedback.sql；不使用 LINE 推播
import { DEMO } from '../config'
import { supabase } from './supabase'
import { demoList, demoSet } from './api'

export const TOPICS = [
  ['booking', '預約'], ['course', '課程與服務'], ['article', '衛教文章'], ['foot', '足型自評'], ['learning', '模擬教室'],
  ['training', '訓練紀錄'], ['live', '直播'], ['app', 'App 操作問題'], ['other', '其他'],
]
export const topicLabel = (k) => TOPICS.find(([x]) => x === k)?.[1] ?? '其他'
export const FB_STATUS = { open: '待回覆', replied: '已回覆', closed: '已結案' }
export const MAX_LEN = 1000
/** 客戶傳到 LINE 的固定文字：官方帳號的「自動回應」關鍵字要完全相同 */
export const LINE_KEYWORD = '我送出了意見回饋'

export function feedbackError(topic, body) {
  if (!TOPICS.some(([k]) => k === topic)) return '請選擇類別'
  const n = (body ?? '').trim().length
  if (!n) return '請填寫內容'
  if (n > MAX_LEN) return `內容請在 ${MAX_LEN} 字以內`
  return ''
}
export function feedbackErrorText(e) {
  const m = String(e?.message ?? '')
  if (m.includes('TOO_MANY')) return '24 小時內最多傳 10 則，請明天再試，或直接傳 LINE 給我們。'
  if (m.includes('CLOSED')) return '這筆回饋已經結案，請新增一筆。'
  return '送出失敗，請確認網路後再試一次。'
}
/** 依時間排序訊息；未讀的在前、再依更新時間新到舊 */
export function arrange(rows, unreadKey) {
  return [...rows].map((r) => ({ ...r, messages: [...(r.messages ?? [])].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)) }))
    .sort((a, b) => Number(b[unreadKey]) - Number(a[unreadKey]) || (a.updated_at < b.updated_at ? 1 : -1))
}

const unwrap = ({ data, error }) => { if (error) throw error; return data }
const FIELDS = 'id, profile_id, topic, status, client_unread, admin_unread, created_at, updated_at, messages:feedback_messages(id, from_admin, body, created_at)'
const now = () => new Date().toISOString()
const demoEdit = (id, fn) => demoSet('feedback', demoList('feedback').map((r) => (r.id === id ? { ...r, ...fn(r), updated_at: now() } : r)))

export async function listMyFeedback(profileId) {
  if (DEMO) return arrange(demoList('feedback').filter((r) => r.profile_id === profileId), 'client_unread')
  return arrange(unwrap(await supabase.from('feedback').select(FIELDS).eq('profile_id', profileId).order('updated_at', { ascending: false }).limit(50)), 'client_unread')
}
export async function countMyUnread(profileId) {
  if (DEMO) return demoList('feedback').filter((r) => r.profile_id === profileId && r.client_unread).length
  const { count, error } = await supabase.from('feedback').select('id', { count: 'exact', head: true }).eq('profile_id', profileId).eq('client_unread', true)
  if (error) throw error
  return count ?? 0
}
export async function submitFeedback(profileId, topic, body) {
  if (DEMO) return demoSet('feedback', [...demoList('feedback'), { id: crypto.randomUUID(), profile_id: profileId, topic, status: 'open', client_unread: false, admin_unread: true, created_at: now(), updated_at: now(), messages: [{ id: crypto.randomUUID(), from_admin: false, body: body.trim(), created_at: now() }] }])
  return unwrap(await supabase.rpc('submit_feedback', { p_topic: topic, p_body: body }))
}
export async function addMessage(id, body, asAdmin) {
  if (DEMO) return demoEdit(id, (r) => ({ status: asAdmin ? 'replied' : 'open', client_unread: !!asAdmin, admin_unread: !asAdmin, messages: [...r.messages, { id: crypto.randomUUID(), from_admin: !!asAdmin, body: body.trim(), created_at: now() }] }))
  return unwrap(await supabase.rpc('add_feedback_message', { p_id: id, p_body: body }))
}
export async function markRead(id, asAdmin) {
  if (DEMO) return demoSet('feedback', demoList('feedback').map((r) => (r.id === id ? { ...r, [asAdmin ? 'admin_unread' : 'client_unread']: false } : r)))
  return unwrap(await supabase.rpc('mark_feedback_read', { p_id: id }))
}

// ── 管理員 ──
export async function adminListFeedback(filter) {
  if (DEMO) return arrange(demoList('feedback').filter((r) => filter === 'all' || r.status !== 'closed').map((r) => ({ ...r, profile: { display_name: '體驗用戶', full_name: null } })), 'admin_unread')
  let q = supabase.from('feedback').select(`${FIELDS}, profile:profiles(display_name, full_name)`).order('updated_at', { ascending: false }).limit(200)
  if (filter !== 'all') q = q.neq('status', 'closed')
  return arrange(unwrap(await q), 'admin_unread')
}
export async function adminCountUnread() {
  if (DEMO) return demoList('feedback').filter((r) => r.admin_unread).length
  const { count, error } = await supabase.from('feedback').select('id', { count: 'exact', head: true }).eq('admin_unread', true)
  if (error) throw error
  return count ?? 0
}
export async function adminSetFeedbackStatus(id, status) {
  if (DEMO) return demoEdit(id, () => ({ status, admin_unread: false }))
  return unwrap(await supabase.rpc('set_feedback_status', { p_id: id, p_status: status }))
}
