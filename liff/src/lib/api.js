// 資料存取層：正式模式走 Supabase，Demo 模式存在瀏覽器 localStorage。
// 頁面只呼叫這裡的函式，不直接碰 Supabase，方便兩種模式切換與日後測試。
import { DEMO, CONSENT_VERSION } from '../config'
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

// ── 足部與鞋墊量測 ────────────────────────────────────────────────────

/** 後台到店量：儲存左右腳（一次寫入） */
export async function saveFeet(profileId, feet, source = 'onsite') {
  const rows = feet.map((f) => ({ ...f, profile_id: profileId, source, algo_version: 'manual-1', quality_flags: [] }))
  if (DEMO) {
    for (const r of rows) demoPush('foot', { ...r, id: crypto.randomUUID(), photo_path: null, width_class: null, created_at: new Date().toISOString() })
    return
  }
  const { error } = await supabase.from('foot_measurements').insert(rows)
  if (error) throw error
}

// ── 足型自評 ──
export const ASSESS_FIELDS = 'id, data, result, photo_left, photo_right, algo_version, created_at'

/** 送出自評。照片上傳失敗不影響送出（回傳 photoFailed） */
export async function submitAssessment(profileId, { data, result, algo, photos }) {
  const id = crypto.randomUUID()
  if (DEMO) {
    const created_at = new Date().toISOString()
    demoPush('assess', { id, data, result, algo_version: algo, photo_left: null, photo_right: null, created_at })
    for (const s of ['left', 'right']) demoPush('foot', { ...data.feet[s], id: crypto.randomUUID(), source: 'self', assessment_id: id, quality_flags: [], algo_version: algo, created_at })
    demoPush('insole', { ...data.insole, id: crypto.randomUUID(), source: 'self', assessment_id: id, created_at })
    return { photoFailed: false }
  }
  const paths = {}
  let photoFailed = false
  for (const s of ['left', 'right']) {
    if (!photos[s]) continue
    const path = `${profileId}/${id}/${s}.jpg`
    const { error } = await supabase.storage.from('foot-photos').upload(path, photos[s], { contentType: 'image/jpeg' }).catch((e) => ({ error: e }))
    if (error) photoFailed = true
    else paths[s] = path
  }
  const { error } = await supabase.rpc('submit_foot_assessment', {
    p_id: id, p_feet: [data.feet.left, data.feet.right], p_insole: data.insole, p_data: data, p_result: result, p_algo: algo,
    p_photo_left: paths.left ?? null, p_photo_right: paths.right ?? null,
  })
  if (error) {
    if (Object.keys(paths).length) await supabase.storage.from('foot-photos').remove(Object.values(paths)).catch(() => {})
    throw error
  }
  return { photoFailed }
}

export async function listAssessments(profileId) {
  if (DEMO) return demoList('assess')
  const { data, error } = await supabase.from('foot_assessments').select(ASSESS_FIELDS).eq('profile_id', profileId).order('created_at', { ascending: true })
  if (error) throw error
  return data
}

/** 刪除一次自評（連同該次尺寸與照片） */
export async function deleteAssessment(row) {
  if (DEMO) {
    demoSet('assess', demoList('assess').filter((r) => r.id !== row.id))
    for (const k of ['foot', 'insole']) demoSet(k, demoList(k).filter((r) => r.assessment_id !== row.id))
    return
  }
  const { data, error } = await supabase.from('foot_assessments').delete().eq('id', row.id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('DELETE_NOT_ALLOWED')
  const paths = [row.photo_left, row.photo_right].filter(Boolean)
  if (paths.length) await supabase.storage.from('foot-photos').remove(paths).catch(() => {})
}

const INSOLE_FIELDS = 'id, side, length_mm, widths, note, source, created_at'

export async function saveInsole(profileId, row, source = 'onsite') {
  if (DEMO) return demoPush('insole', { ...row, profile_id: profileId, source, id: crypto.randomUUID(), created_at: new Date().toISOString() })
  const { error } = await supabase.from('insole_measurements').insert({ ...row, profile_id: profileId, source })
  if (error) throw error
}

export async function listInsoles(profileId) {
  if (DEMO) return demoList('insole')
  const { data, error } = await supabase.from('insole_measurements').select(INSOLE_FIELDS)
    .eq('profile_id', profileId).order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function deleteInsole(id) {
  if (DEMO) return demoSet('insole', demoList('insole').filter((r) => r.id !== id))
  const { data, error } = await supabase.from('insole_measurements').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('DELETE_NOT_ALLOWED')
}

export async function listFootMeasurements(profileId) {
  if (DEMO) return demoList('foot')
  const { data, error } = await supabase
    .from('foot_measurements')
    .select('id, side, length_mm, width_mm, heel_width_mm, source, width_class, quality_flags, algo_version, photo_path, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

/**
 * 刪除一筆足部量測（含照片）。客戶只能刪自己 24 小時內的（資料庫 policy 把關），管理員不限。
 * 先刪資料列再刪照片：資料列刪不掉（例如超過時限）就不會動到照片。
 */
export async function deleteFootMeasurement(row) {
  if (DEMO) {
    demoSet('foot', demoList('foot').filter((r) => r.id !== row.id))
    return
  }
  const { data, error } = await supabase.from('foot_measurements').delete().eq('id', row.id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('DELETE_NOT_ALLOWED')
  if (row.photo_path) {
    // 照片刪除失敗不影響結果（資料列已刪），只留下無主檔案
    await supabase.storage.from('foot-photos').remove([row.photo_path]).catch(() => {})
  }
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
