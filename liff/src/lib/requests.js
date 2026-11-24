// 體驗課程申請：新客人填資料 → 管理員確認後協助預約（規則見 supabase/migrations/0013_trial_requests.sql）
import { DEMO } from '../config'
import { supabase } from './supabase'
import { demoGet, demoList, demoSet } from './api'

export const REQUEST_STATUS = { pending: '待確認', contacted: '已聯繫', booked: '已預約', closed: '已結案' }
export const REQUEST_SOURCES = ['LINE', 'Instagram', 'Facebook', 'Google 搜尋／地圖', '朋友介紹', '路過', '其他']
export const isOpenRequest = (r) => r.status === 'pending' || r.status === 'contacted'

/** 申請人資料檢查；回傳第一個錯誤訊息，沒問題回傳 '' */
export function contactError(c, today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())) {
  if (!c.full_name?.trim()) return '請填寫姓名'
  if (!['male', 'female', 'other'].includes(c.gender)) return '請選擇性別'
  if (!c.birthday) return '請填寫生日'
  if (c.birthday > today || c.birthday < '1900-01-01') return '生日不正確'
  if (!/^(09|8869)\d{8}$/.test((c.phone ?? '').replace(/\D/g, ''))) return '請填寫正確的手機號碼（09 開頭共 10 碼）'
  return ''
}

const unwrap = ({ data, error }) => { if (error) throw error; return data }
const FIELDS = 'id, profile_id, service_id, concern, preferred, source, status, created_at, service:services(name)'

export async function listMyRequests(profileId) {
  if (DEMO) return demoList('requests').filter((r) => r.profile_id === profileId).reverse()
  return unwrap(await supabase.from('booking_requests').select(FIELDS).eq('profile_id', profileId).order('created_at', { ascending: false }))
}

export async function submitTrialRequest(profileId, { service, concern, preferred, source }) {
  if (!concern.trim() || !preferred.trim()) throw new Error('BAD_INPUT')
  if (DEMO) {
    if (demoList('requests').some((r) => r.profile_id === profileId && isOpenRequest(r))) throw new Error('REQUEST_PENDING')
    return demoSet('requests', [...demoList('requests'), {
      id: crypto.randomUUID(), profile_id: profileId, service_id: service.id, service: { name: service.name },
      concern: concern.trim(), preferred: preferred.trim(), source: source || null, status: 'pending', created_at: new Date().toISOString(),
    }])
  }
  return unwrap(await supabase.rpc('submit_trial_request', {
    p_service: service.id, p_concern: concern, p_preferred: preferred, p_source: source || null,
  }))
}

// ── 管理員 ──────────────────────────────────────────────────────────────────

/** 全部申請，新的在前 */
export async function adminListRequests() {
  if (DEMO) return demoList('requests').map((r) => ({ ...r, profile: { id: r.profile_id, display_name: '體驗用戶', full_name: null, phone: null, ...(demoGet(`info:${r.profile_id}`) ?? {}) } })).reverse()
  return unwrap(await supabase.from('booking_requests')
    .select(`${FIELDS}, profile:profiles(id, display_name, full_name, phone, gender, birthday)`).order('created_at', { ascending: false }).limit(200))
}

export async function adminSetRequestStatus(id, status) {
  if (DEMO) return demoSet('requests', demoList('requests').map((r) => (r.id === id ? { ...r, status } : r)))
  unwrap(await supabase.from('booking_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id))
}
