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

const demoKey = (k) => `youcore-demo:${k}`
const demoGet = (k) => {
  try { return JSON.parse(localStorage.getItem(demoKey(k))) } catch { return null }
}
const demoSet = (k, v) => {
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

const demoList = (k) => demoGet(k) ?? []
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

export async function requestDeletion(profileId) {
  if (DEMO) return demoSet('deletion', new Date().toISOString())
  const { error } = await supabase.from('deletion_requests').insert({ profile_id: profileId })
  if (error) throw error
}
