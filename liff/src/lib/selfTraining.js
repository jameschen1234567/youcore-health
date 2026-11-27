// 客人自主訓練與目標體重（會員限定）。規則見 supabase/migrations/0034_self_training_target.sql
// 訓練量：session-RPE（Foster 2001）= 時間（分）× RPE（1–10），單位 AU。
import { DEMO } from '../config'
import { supabase } from './supabase'
import { demoGet, demoList, demoSet } from './api'
import { numberSets } from './training'

const unwrap = ({ data, error }) => { if (error) throw error; return data }
export const todayTaipei = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())
const addDays = (d, n) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }

export const KINDS = {
  strength: '重訓', run: '跑步', walk: '走路／健走', bike: '騎車', swim: '游泳', yoga: '瑜伽／伸展', ball: '球類', other: '其他',
}
export const RPE_HINT = {
  1: '非常輕鬆', 2: '輕鬆', 3: '輕鬆，可以聊天', 4: '有點費力', 5: '費力', 6: '費力，說話變短句',
  7: '很喘、很吃力', 8: '非常吃力', 9: '接近極限', 10: '極限',
}
export const MAX_BACK_DAYS = 30

// ── 純函式 ──────────────────────────────────────────────────────────────────

export const sessionLoad = (w) => Number(w.duration_min) * Number(w.rpe)

/** 該日期所在週的週一（YYYY-MM-DD） */
export function weekStart(d) {
  const t = new Date(`${d}T00:00:00Z`)
  const dow = (t.getUTCDay() + 6) % 7 // 週一 = 0
  t.setUTCDate(t.getUTCDate() - dow)
  return t.toISOString().slice(0, 10)
}

/** 近 n 週（含本週）每週：{ week, load, minutes, count }，舊的在前 */
export function weeklySummary(rows, today = todayTaipei(), weeks = 8) {
  const thisWeek = weekStart(today)
  const out = Array.from({ length: weeks }, (_, i) => ({ week: addDays(thisWeek, -7 * (weeks - 1 - i)), load: 0, minutes: 0, count: 0 }))
  const idx = Object.fromEntries(out.map((w, i) => [w.week, i]))
  for (const r of rows ?? []) {
    const i = idx[weekStart(r.done_on)]
    if (i == null) continue
    out[i].load += sessionLoad(r)
    out[i].minutes += Number(r.duration_min)
    out[i].count += 1
  }
  return out
}

export function validateWorkout(v, today = todayTaipei()) {
  if (!v.done_on) return '請填日期'
  if (v.done_on > today) return '不能記未來的日期'
  if (v.done_on < addDays(today, -MAX_BACK_DAYS)) return `只能補記 ${MAX_BACK_DAYS} 天內的訓練`
  if (!KINDS[v.kind]) return '請選類型'
  const m = Number(v.duration_min)
  if (!Number.isInteger(m) || m < 1 || m > 600) return '時間請填 1～600 分鐘'
  const r = Number(v.rpe)
  if (!Number.isInteger(r) || r < 1 || r > 10) return '請選自覺強度 1～10'
  if ((v.note ?? '').length > 200) return '備註最多 200 字'
  if (v.kind === 'strength') {
    const bad = (v.sets ?? []).find((s) => s.exercise_id && (s.weight_kg !== '' || s.reps !== '') &&
      (s.weight_kg === '' || s.reps === '' || Number(s.weight_kg) < 0 || !(Number(s.reps) >= 1 && Number(s.reps) <= 100)))
    if (bad) return '有一組的重量或次數沒填完整（次數 1～100）'
  }
  return null
}

/** 目標體重進度：用店內量的體重（body_compositions） */
export function weightProgress(bodyRows, target) {
  const t = Number(target)
  if (!(t > 0)) return null
  const ws = [...(bodyRows ?? [])].filter((r) => r.weight_kg != null).sort((a, b) => a.measured_on.localeCompare(b.measured_on))
  if (ws.length === 0) return { target: t, current: null }
  const start = Number(ws[0].weight_kg)
  const current = Number(ws.at(-1).weight_kg)
  const remaining = Math.round((current - t) * 10) / 10 // 正數＝還要減、負數＝還要增
  const total = start - t
  const pct = total === 0 ? 100 : Math.max(0, Math.min(100, Math.round(((start - current) / total) * 100)))
  return { target: t, start, current, remaining, pct, reached: total >= 0 ? current <= t : current >= t, measured_on: ws.at(-1).measured_on }
}

// ── 自主訓練 ────────────────────────────────────────────────────────────────

const FIELDS = 'id, profile_id, done_on, kind, duration_min, rpe, note, created_at, sets:self_workout_sets(id, exercise_id, set_no, position, weight_kg, reps)'

/** 舊的在前 */
export async function listSelfWorkouts(profileId) {
  if (DEMO) return demoList(`self:${profileId}`).sort((a, b) => a.done_on.localeCompare(b.done_on) || a.created_at.localeCompare(b.created_at))
  const rows = unwrap(await supabase.from('self_workouts').select(FIELDS).eq('profile_id', profileId)
    .order('done_on', { ascending: true }).order('created_at', { ascending: true }))
  return rows.map((w) => ({ ...w, sets: [...(w.sets ?? [])].sort((a, b) => a.position - b.position) }))
}

export async function saveSelfWorkout(profileId, v) {
  const row = {
    done_on: v.done_on, kind: v.kind, duration_min: Number(v.duration_min), rpe: Number(v.rpe), note: v.note?.trim() || null,
  }
  const sets = v.kind === 'strength'
    ? numberSets(v.sets ?? []).map(({ exercise_id, set_no, position, weight_kg, reps }) => ({ exercise_id, set_no, position, weight_kg, reps }))
    : []
  if (DEMO) {
    const list = demoList(`self:${profileId}`)
    const id = v.id ?? crypto.randomUUID()
    const full = { id, profile_id: profileId, ...row, sets: sets.map((s) => ({ id: crypto.randomUUID(), ...s })) }
    demoSet(`self:${profileId}`, v.id ? list.map((x) => (x.id === v.id ? { ...x, ...full } : x)) : [...list, { ...full, created_at: new Date().toISOString() }])
    return
  }
  let id = v.id
  if (id) {
    unwrap(await supabase.from('self_workouts').update(row).eq('id', id))
    unwrap(await supabase.from('self_workout_sets').delete().eq('workout_id', id))
  } else {
    id = unwrap(await supabase.from('self_workouts').insert({ profile_id: profileId, ...row }).select('id').single()).id
  }
  if (sets.length) unwrap(await supabase.from('self_workout_sets').insert(sets.map((s) => ({ workout_id: id, ...s }))))
}

export async function deleteSelfWorkout(profileId, id) {
  if (DEMO) return demoSet(`self:${profileId}`, demoList(`self:${profileId}`).filter((x) => x.id !== id))
  unwrap(await supabase.from('self_workouts').delete().eq('id', id))
}

// ── 目標體重 ────────────────────────────────────────────────────────────────

export async function getTarget(profileId) {
  if (DEMO) return demoGet(`target:${profileId}`) ?? { target_weight_kg: null, target_date: null }
  return unwrap(await supabase.from('profiles').select('target_weight_kg, target_date').eq('id', profileId).single())
}

export async function saveTarget(profileId, kg, date) {
  const t = kg === '' || kg == null ? null : Math.round(Number(kg) * 10) / 10
  if (t != null && !(t >= 30 && t <= 250)) throw new Error('BAD_TARGET')
  const row = { target_weight_kg: t, target_date: t == null ? null : date || null }
  if (DEMO) return demoSet(`target:${profileId}`, row)
  unwrap(await supabase.from('profiles').update(row).eq('id', profileId))
}
