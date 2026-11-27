// 基本資料、身體組成、訓練紀錄的資料存取。正式模式走 Supabase，Demo 模式存 localStorage。
// 權限由資料庫把關：客戶只能讀自己的；新增／修改身體組成與訓練只有管理員。
import { DEMO } from '../config'
import { supabase } from './supabase'
import { demoGet, demoList, demoSet } from './api'

export const INFO_FIELDS = 'full_name, gender, birthday, phone, email, height_cm, medical_notes, info_completed_at'
export const GENDERS = { male: '男', female: '女' }

// Demo 模式的內建動作（與 migration 0007 一致）
const DEFAULT_EXERCISES = [
  ['背蹲舉', 'lower'], ['前蹲舉', 'lower'], ['高腳杯深蹲', 'lower'], ['傳統硬舉', 'hinge'], ['相撲硬舉', 'hinge'],
  ['羅馬尼亞硬舉', 'hinge'], ['六角槓硬舉', 'hinge'], ['臀推', 'hinge'], ['腿推', 'lower'], ['保加利亞分腿蹲', 'lower'],
  ['弓箭步', 'lower'], ['槓鈴臥推', 'push'], ['上斜臥推', 'push'], ['啞鈴臥推', 'push'], ['站姿肩推', 'push'],
  ['啞鈴肩推', 'push'], ['雙槓撐體', 'push'], ['引體向上', 'pull'], ['滑輪下拉', 'pull'], ['槓鈴划船', 'pull'],
  ['啞鈴單臂划船', 'pull'], ['坐姿划船', 'pull'],
].map(([name, category], i) => ({ id: `ex-${i + 1}`, name, category, is_custom: false, sort_order: i }))

/** 'YYYY-MM-DD' → 本地日期（避免時區把日期往前推一天） */
export const toDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const fmtDay = (s) => s?.replaceAll('-', '/') ?? ''
/** 今天的台北日期 YYYY-MM-DD */
export const todayTaipei = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())

const byDate = (k) => (a, b) => (a[k] ?? '').localeCompare(b[k] ?? '')
const uid = () => crypto.randomUUID()

// ── 基本資料 ────────────────────────────────────────────────────────────────

export async function getProfileInfo(profileId) {
  if (DEMO) return demoGet(`info:${profileId}`) ?? {}
  const { data, error } = await supabase.from('profiles').select(INFO_FIELDS).eq('id', profileId).single()
  if (error) throw error
  return data
}

/** 客戶自己填寫／修改；身高只有首次能填（資料庫 trigger 把關，畫面也會鎖住） */
export async function saveProfileInfo(profileId, fields) {
  const row = { ...fields, info_completed_at: fields.info_completed_at ?? new Date().toISOString() }
  if (DEMO) {
    const cur = demoGet(`info:${profileId}`) ?? {}
    if ('height_cm' in row && cur.height_cm != null && row.height_cm !== cur.height_cm && !fields._admin) throw new Error('HEIGHT_LOCKED')
    delete row._admin
    demoSet(`info:${profileId}`, { ...cur, ...row })
    return
  }
  delete row._admin
  const { error } = await supabase.from('profiles').update(row).eq('id', profileId)
  if (error) throw error
}

/** 管理員修改客戶基本資料（含身高） */
export const adminSaveProfileInfo = (profileId, fields) => saveProfileInfo(profileId, { ...fields, _admin: true })

// ── 身體組成 ────────────────────────────────────────────────────────────────

const BODY_FIELDS = 'id, measured_on, weight_kg, muscle_kg, fat_kg, visceral_level, note, created_at'

export async function listBodyComps(profileId) {
  if (DEMO) return demoList(`body:${profileId}`).sort(byDate('measured_on'))
  const { data, error } = await supabase.from('body_compositions').select(BODY_FIELDS)
    .eq('profile_id', profileId).order('measured_on', { ascending: true })
  if (error) throw error
  return data
}

/** 新增或修改（有 id 就是修改） */
export async function adminSaveBodyComp(profileId, row) {
  const clean = {
    measured_on: row.measured_on,
    weight_kg: numOrNull(row.weight_kg),
    muscle_kg: numOrNull(row.muscle_kg),
    fat_kg: numOrNull(row.fat_kg),
    visceral_level: numOrNull(row.visceral_level),
    note: row.note?.trim() || null,
  }
  if (DEMO) {
    const rows = demoList(`body:${profileId}`)
    const next = row.id
      ? rows.map((r) => (r.id === row.id ? { ...r, ...clean } : r))
      : [...rows, { id: uid(), ...clean, created_at: new Date().toISOString() }]
    demoSet(`body:${profileId}`, next)
    return
  }
  const q = row.id
    ? supabase.from('body_compositions').update(clean).eq('id', row.id)
    : supabase.from('body_compositions').insert({ profile_id: profileId, ...clean })
  const { error } = await q
  if (error) throw error
}

export async function adminDeleteBodyComp(profileId, id) {
  if (DEMO) return demoSet(`body:${profileId}`, demoList(`body:${profileId}`).filter((r) => r.id !== id))
  const { error } = await supabase.from('body_compositions').delete().eq('id', id)
  if (error) throw error
}

// ── 動作清單 ────────────────────────────────────────────────────────────────

export async function listExercises() {
  if (DEMO) return [...DEFAULT_EXERCISES, ...demoList('exercises')]
  const { data, error } = await supabase.from('exercises').select('id, name, category, is_custom, sort_order')
    .order('sort_order').order('name')
  if (error) throw error
  return data
}

export async function adminAddExercise(name) {
  const n = name.trim()
  if (!n) throw new Error('EMPTY_NAME')
  if (DEMO) {
    const all = await listExercises()
    const found = all.find((e) => e.name === n)
    if (found) return found
    const row = { id: uid(), name: n, category: 'other', is_custom: true, sort_order: 1000 }
    demoSet('exercises', [...demoList('exercises'), row])
    return row
  }
  const { data: existing } = await supabase.from('exercises').select('id, name, category, is_custom, sort_order').eq('name', n).maybeSingle()
  if (existing) return existing
  const { data, error } = await supabase.from('exercises')
    .insert({ name: n, is_custom: true, sort_order: 1000 }).select('id, name, category, is_custom, sort_order').single()
  if (error) throw error
  return data
}

// ── 訓練紀錄 ────────────────────────────────────────────────────────────────

const SET_FIELDS = 'id, exercise_id, set_no, position, weight_kg, reps, rpe, hr'

/** 訓練列表（含每組），舊的在前 */
export async function listTrainingSessions(profileId) {
  if (DEMO) return demoList(`sessions:${profileId}`).sort(byDate('session_date'))
  const { data, error } = await supabase.from('training_sessions')
    .select(`id, session_date, note, rest_hr, avg_hr, max_hr, created_at, sets:training_sets(${SET_FIELDS})`)
    .eq('profile_id', profileId).order('session_date', { ascending: true })
  if (error) throw error
  return data.map((s) => ({ ...s, sets: [...(s.sets ?? [])].sort(sortSets) }))
}

/**
 * 新增或修改一次訓練。sets: [{ exercise_id, weight_kg, reps, rpe }]（依顯示順序）
 * 修改時整批取代該次訓練的組數，避免逐筆比對出錯。
 */
export async function adminSaveSession(profileId, { id, session_date, note, sets, rest_hr, avg_hr, max_hr }) {
  const numbered = numberSets(sets)
  const hr = { rest_hr: intOrNull(rest_hr), avg_hr: intOrNull(avg_hr), max_hr: intOrNull(max_hr) }
  if (DEMO) {
    const rows = demoList(`sessions:${profileId}`)
    const sid = id ?? uid()
    const row = { id: sid, session_date, note: note?.trim() || null, ...hr, created_at: new Date().toISOString(),
      sets: numbered.map((s) => ({ id: uid(), ...s })) }
    demoSet(`sessions:${profileId}`, id ? rows.map((r) => (r.id === id ? { ...row, created_at: r.created_at } : r)) : [...rows, row])
    return sid
  }
  let sid = id
  if (id) {
    const { error } = await supabase.from('training_sessions').update({ session_date, note: note?.trim() || null, ...hr }).eq('id', id)
    if (error) throw error
    const del = await supabase.from('training_sets').delete().eq('session_id', id)
    if (del.error) throw del.error
  } else {
    const { data, error } = await supabase.from('training_sessions')
      .insert({ profile_id: profileId, session_date, note: note?.trim() || null, ...hr }).select('id').single()
    if (error) throw error
    sid = data.id
  }
  if (numbered.length) {
    const { error } = await supabase.from('training_sets').insert(numbered.map((s) => ({ session_id: sid, ...s })))
    if (error) throw error
  }
  return sid
}

export async function adminDeleteSession(profileId, id) {
  if (DEMO) return demoSet(`sessions:${profileId}`, demoList(`sessions:${profileId}`).filter((r) => r.id !== id))
  const { error } = await supabase.from('training_sessions').delete().eq('id', id)
  if (error) throw error
}

// ── 小工具 ──────────────────────────────────────────────────────────────────

function intOrNull(v) {
  const n = numOrNull(v)
  return n == null ? null : Math.round(n)
}

function numOrNull(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** 同一動作內依順序編組號 1, 2, 3…；過濾掉沒填重量或次數的空列 */
export function numberSets(sets) {
  const count = {}
  return (sets ?? [])
    .filter((s) => s.exercise_id && s.reps !== '' && s.reps != null && s.weight_kg !== '' && s.weight_kg != null)
    .map((s, i) => {
      count[s.exercise_id] = (count[s.exercise_id] ?? 0) + 1
      return {
        exercise_id: s.exercise_id,
        set_no: count[s.exercise_id],
        position: i,
        weight_kg: Number(s.weight_kg),
        reps: Number(s.reps),
        rpe: s.rpe === '' || s.rpe == null ? null : Number(s.rpe),
        hr: intOrNull(s.hr),
      }
    })
}

function sortSets(a, b) {
  return (a.position ?? 0) - (b.position ?? 0)
}

/** 依動作分組（保持第一次出現的順序），給畫面顯示 */
export function groupSets(sets) {
  const order = []
  const map = {}
  for (const s of sets ?? []) {
    if (!map[s.exercise_id]) { map[s.exercise_id] = []; order.push(s.exercise_id) }
    map[s.exercise_id].push(s)
  }
  return order.map((ex) => ({ exercise_id: ex, sets: map[ex].sort((a, b) => a.set_no - b.set_no) }))
}
