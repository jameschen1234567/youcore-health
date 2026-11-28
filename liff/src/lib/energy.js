// 熱量消耗與每日收支。規則見 supabase/migrations/0036_energy.sql
// 基礎代謝：Mifflin-St Jeor（1990, AJCN）男 10W + 6.25H − 5A + 5；女 10W + 6.25H − 5A − 161
// 運動：kcal = MET × 體重 kg × 時數；MET 取自 2024 Adult Compendium of Physical Activities（pacompendium.com）
// 「RPE ≥ 7 改用高強度值」與「上課各組平均 RPE ≥ 8 算高強度」為宥芯自訂規則，不是 Compendium 的規定。
import { DEMO } from '../config'
import { supabase } from './supabase'
import { demoGet, demoList, demoSet } from './api'

const unwrap = ({ data, error }) => { if (error) throw error; return data }
export const todayTaipei = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())
const addDays = (d, n) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
export const MAX_BACK_DAYS = 7
export const HIGH_RPE = 7
export const COACH_HIGH_RPE = 8

/** 自主訓練類型 → [一般, 高強度] 的 MET 與 Compendium 代碼 */
export const METS = {
  strength: [{ met: 3.5, code: '02054', label: '重訓，多動作 8–15 下' }, { met: 6.0, code: '02050', label: '重訓，高強度' }],
  run: [{ met: 8.0, code: '12150', label: '跑步' }, { met: 8.0, code: '12150', label: '跑步' }],
  walk: [{ met: 3.8, code: '17190', label: '走路，中速' }, { met: 4.8, code: '17200', label: '快走' }],
  bike: [{ met: 6.8, code: '01020', label: '騎車，休閒' }, { met: 7.0, code: '01014', label: '騎車，一般' }],
  swim: [{ met: 5.8, code: '18240', label: '游泳，慢速自由式' }, { met: 8.0, code: '18290', label: '游泳，中速自由式' }],
  yoga: [{ met: 2.3, code: '02150', label: '瑜伽' }, { met: 2.3, code: '02150', label: '瑜伽' }],
  ball: [{ met: 5.5, code: '15030', label: '羽球一般' }, { met: 7.5, code: '15055', label: '籃球一般' }],
  other: null,
}
export const COACH_METS = [METS.strength[0], METS.strength[1]]

// ── 純函式 ──────────────────────────────────────────────────────────────────

/** 基礎代謝（大卡／天）；資料不足或性別非男女時回傳 null */
export function mifflin({ weight_kg, height_cm, age, gender }) {
  const w = Number(weight_kg); const h = Number(height_cm); const a = Number(age)
  if (!(w > 0) || !(h > 0) || !(a > 0) || !['male', 'female'].includes(gender)) return null
  return Math.round(10 * w + 6.25 * h - 5 * a + (gender === 'male' ? 5 : -161))
}

export const metKcal = (met, kg, minutes) => Math.round(met * Number(kg) * (Number(minutes) / 60))

/** 自主訓練推估：{ kcal, met, code, label } 或 null（其他類型／缺體重） */
export function selfWorkoutKcal(w, kg) {
  const m = METS[w.kind]
  if (!m || !(Number(kg) > 0)) return null
  const pick = m[Number(w.rpe) >= HIGH_RPE ? 1 : 0]
  return { kcal: metKcal(pick.met, kg, w.duration_min), ...pick }
}

/** 教練課推估：沒填上課分鐘的不算 */
export function coachSessionKcal(s, kg) {
  if (!s.duration_min || !(Number(kg) > 0)) return null
  const rpes = (s.sets ?? []).map((x) => x.rpe).filter((r) => r != null).map(Number)
  const avg = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null
  const pick = COACH_METS[avg != null && avg >= COACH_HIGH_RPE ? 1 : 0]
  return { kcal: metKcal(pick.met, kg, s.duration_min), ...pick }
}

/**
 * 某一天的收支。
 * activity: { steps, active_kcal } | undefined；workouts: [{ name, kcal }]
 * 總消耗：有手機活動熱量 → 基礎代謝 + 手機活動熱量；沒有 → 基礎代謝 + 訓練推估合計
 */
export function dayBalance({ bmr, intake, activity, workouts }) {
  const workoutKcal = workouts.reduce((n, w) => n + (w.kcal ?? 0), 0)
  const usePhone = activity?.active_kcal != null
  const active = usePhone ? Number(activity.active_kcal) : workoutKcal
  const burn = bmr == null ? null : bmr + active
  return {
    bmr, active, activeSource: usePhone ? 'phone' : 'workouts', workoutKcal, burn,
    intake, balance: burn == null || intake == null ? null : Math.round(intake - burn),
  }
}

/** 店內最新體重 */
export function latestWeight(bodyRows) {
  const ws = [...(bodyRows ?? [])].filter((r) => r.weight_kg != null).sort((a, b) => a.measured_on.localeCompare(b.measured_on))
  return ws.length ? { kg: Number(ws.at(-1).weight_kg), on: ws.at(-1).measured_on } : null
}

export function validateActivity(v, today = todayTaipei()) {
  if (!v.day || v.day > today) return '日期不能是未來'
  if (v.day < addDays(today, -MAX_BACK_DAYS)) return `只能補填 ${MAX_BACK_DAYS} 天內`
  const s = v.steps === '' || v.steps == null ? null : Number(v.steps)
  const k = v.active_kcal === '' || v.active_kcal == null ? null : Number(v.active_kcal)
  if (s == null && k == null) return '步數或活動熱量至少填一個'
  if (s != null && !(Number.isInteger(s) && s >= 0 && s <= 100000)) return '步數請填 0～100000 的整數'
  if (k != null && !(Number.isInteger(k) && k >= 0 && k <= 5000)) return '活動熱量請填 0～5000 的整數'
  return null
}

// ── 個別開放 ────────────────────────────────────────────────────────────────

/** 會員＋管理員已開放「飲食與熱量」 */
export function isNutrition(profile) {
  if (DEMO) return !!demoGet(`member_no:${profile.id}`) && !!demoGet(`nutrition:${profile.id}`)
  return !!profile?.member_no && !!profile?.nutrition_enabled
}

export async function getNutritionEnabled(profileId) {
  if (DEMO) return !!demoGet(`nutrition:${profileId}`)
  return unwrap(await supabase.from('profiles').select('nutrition_enabled').eq('id', profileId).single()).nutrition_enabled
}

export async function adminSetNutrition(profileId, on) {
  if (DEMO) return demoSet(`nutrition:${profileId}`, !!on)
  unwrap(await supabase.from('profiles').update({ nutrition_enabled: !!on }).eq('id', profileId))
}

// ── 每日活動資料 ────────────────────────────────────────────────────────────

export async function listActivity(profileId, fromDay) {
  if (DEMO) return demoList(`activity:${profileId}`).filter((a) => a.day >= fromDay)
  return unwrap(await supabase.from('daily_activity').select('day, steps, active_kcal, source').eq('profile_id', profileId).gte('day', fromDay).order('day'))
}

export async function saveActivity(profileId, v) {
  const row = {
    day: v.day,
    steps: v.steps === '' || v.steps == null ? null : Number(v.steps),
    active_kcal: v.active_kcal === '' || v.active_kcal == null ? null : Number(v.active_kcal),
  }
  if (DEMO) return demoSet(`activity:${profileId}`, [...demoList(`activity:${profileId}`).filter((a) => a.day !== v.day), row])
  unwrap(await supabase.from('daily_activity').upsert({ profile_id: profileId, ...row, source: 'manual' }, { onConflict: 'profile_id,day' }))
}
