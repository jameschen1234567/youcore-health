// 資料存取層：正式模式走 Supabase，Demo 模式存在瀏覽器 localStorage。
// 頁面只呼叫這裡的函式，不直接碰 Supabase，方便兩種模式切換與日後測試。
import { DEMO, CONSENT_VERSION, FOOT_API_URL } from '../config'
import { supabase } from './supabase'
import { DEMO_CONTENT } from '../demo/content'

const CONTENT_FIELDS = 'id, type, title, category, cover_url, video_url, related_service, published_at'

/** 內容列表（不含內文），新的在前。type: 'article' | 'video' | 'brand' */
export async function listContent(type) {
  if (DEMO) {
    return DEMO_CONTENT.filter((c) => c.type === type)
      .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
  }
  const { data, error } = await supabase
    .from('content_items')
    .select(CONTENT_FIELDS)
    .eq('type', type)
    .order('published_at', { ascending: false, nullsFirst: false })
  if (error) throw error
  return data
}

export async function getContent(id) {
  if (DEMO) return DEMO_CONTENT.find((c) => c.id === id) ?? null
  const { data, error } = await supabase
    .from('content_items')
    .select(`${CONTENT_FIELDS}, body`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export const demoKey = (k) => `youcore-demo:${k}`
export const demoGet = (k) => {
  try { return JSON.parse(localStorage.getItem(demoKey(k))) } catch { return null }
}
export const demoSet = (k, v) => {
  try { localStorage.setItem(demoKey(k), JSON.stringify(v)) } catch { /* 私密模式忽略 */ }
}

export async function hasCurrentConsent(profileId) {
  if (DEMO) return demoGet('consent') === CONSENT_VERSION
  const { data, error } = await supabase
    .from('consents')
    .select('id')
    .eq('profile_id', profileId)
    .eq('consent_version', CONSENT_VERSION)
    .is('revoked_at', null)
    .limit(1)
  if (error) throw error
  return data.length > 0
}

export async function giveConsent(profileId) {
  if (DEMO) return demoSet('consent', CONSENT_VERSION)
  const { error } = await supabase
    .from('consents')
    .insert({ profile_id: profileId, consent_version: CONSENT_VERSION })
  if (error) throw error
}

// ── 量表與疼痛地圖 ──────────────────────────────────────────────

export const demoList = (k) => demoGet(k) ?? []
const demoPush = (k, row) => {
  const rows = demoList(k)
  rows.push(row)
  demoSet(k, rows)
  return row
}

/** 送出量表答案（分數在前端用共用計分模組算好） */
export async function saveResponse(profileId, config, answers, result) {
  const row = {
    profile_id: profileId,
    questionnaire_key: config.key,
    questionnaire_version: config.version,
    answers,
    scores: result,
    computable: result.computable,
  }
  if (DEMO) return demoPush(`responses:${config.key}`, { ...row, id: crypto.randomUUID(), submitted_at: new Date().toISOString() })
  const { data, error } = await supabase.from('questionnaire_responses').insert(row).select().single()
  if (error) throw error
  return data
}

/** 某份量表的歷次紀錄，舊到新 */
export async function listResponses(profileId, key) {
  if (DEMO) return demoList(`responses:${key}`)
  const { data, error } = await supabase
    .from('questionnaire_responses')
    .select('id, questionnaire_version, scores, computable, submitted_at')
    .eq('profile_id', profileId)
    .eq('questionnaire_key', key)
    .order('submitted_at', { ascending: true })
  if (error) throw error
  return data
}

export async function savePainMap(profileId, regions) {
  const row = { profile_id: profileId, regions }
  if (DEMO) return demoPush('painmaps', { ...row, id: crypto.randomUUID(), submitted_at: new Date().toISOString() })
  const { data, error } = await supabase.from('pain_maps').insert(row).select().single()
  if (error) throw error
  return data
}

export async function listPainMaps(profileId) {
  if (DEMO) return demoList('painmaps')
  const { data, error } = await supabase
    .from('pain_maps')
    .select('id, regions, submitted_at')
    .eq('profile_id', profileId)
    .order('submitted_at', { ascending: true })
  if (error) throw error
  return data
}

// ── 足部初篩 ────────────────────────────────────────────────────

export class FootApiError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

/** 上傳一張照片到 Python 後端量測。成功回傳 {side, length_mm, width_mm, width_class, quality_flags, algo_version} */
export async function measureFoot(blob, side) {
  if (!FOOT_API_URL) {
    if (!DEMO) throw new FootApiError('NOT_CONFIGURED', '尚未設定量測服務')
    // Demo 模式沒有後端：回傳固定的示範數值，並以 DEMO 旗標標示
    await new Promise((r) => setTimeout(r, 600))
    return { side, length_mm: side === 'left' ? 248.5 : 251.0, width_mm: side === 'left' ? 95.5 : 96.0, width_class: null, quality_flags: ['DEMO'], algo_version: 'demo' }
  }
  const form = new FormData()
  form.append('file', blob, `${side}.jpg`)
  form.append('side', side)
  const headers = {}
  if (!DEMO) {
    const { data } = await supabase.auth.getSession()
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`
  }
  let res
  try {
    res = await fetch(`${FOOT_API_URL}/foot/measure`, { method: 'POST', body: form, headers })
  } catch {
    throw new FootApiError('NETWORK')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new FootApiError(body?.detail?.code ?? `HTTP_${res.status}`, body?.detail?.message)
  return body
}

/** 儲存一隻腳的量測結果；照片存到 foot-photos/{profile_id}/{id}/{side}.jpg */
export async function saveFootMeasurement(profileId, result, photo) {
  const id = crypto.randomUUID()
  const row = {
    id,
    profile_id: profileId,
    side: result.side,
    length_mm: result.length_mm,
    width_mm: result.width_mm,
    width_class: result.width_class,
    algo_version: result.algo_version,
    quality_flags: result.quality_flags,
  }
  if (DEMO) return demoPush('foot', { ...row, photo_path: null, created_at: new Date().toISOString() })
  const path = `${profileId}/${id}/${result.side}.jpg`
  const up = await supabase.storage.from('foot-photos').upload(path, photo, { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  const { data, error } = await supabase.from('foot_measurements').insert({ ...row, photo_path: path }).select().single()
  if (error) throw error
  return data
}

export async function listFootMeasurements(profileId) {
  if (DEMO) return demoList('foot')
  const { data, error } = await supabase
    .from('foot_measurements')
    .select('id, side, length_mm, width_mm, width_class, quality_flags, algo_version, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

// ── 訂單（客戶只能看自己的；建立與更新在管理後台）──────────────────

export const ORDER_FIELDS = 'id, profile_id, product_type, status, note, notified_at, created_at, updated_at, events:order_events(status, created_at)'

export async function listOrders(profileId) {
  if (DEMO) return demoList('orders').filter((o) => o.profile_id === profileId)
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_FIELDS)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function requestDeletion(profileId) {
  if (DEMO) return demoSet('deletion', new Date().toISOString())
  const { error } = await supabase.from('deletion_requests').insert({ profile_id: profileId })
  if (error) throw error
}
