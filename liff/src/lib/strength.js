// 最大肌力（1RM）推估、身體組成衍生數值。純函式，方便測試。
//
// 方法：NSCA %1RM–次數對照表 + RPE 修正
//   1. 等效次數 = 實際次數 + (10 − RPE)；沒填 RPE 的組視為熱身，不推估（2026-11-28 James 決定）
//   2. 推估 1RM = 重量 ÷ 對照表百分比；非整數次數用前後兩格線性內插（12～15 下之間也線性內插）
//   3. 等效次數 > 15 或重量／次數為 0 的組不列入
//   4. 同一動作優先採用等效 ≤ 10 下的組（誤差較小）；沒有才採用 11～15 下的組
//
// ⚠ 對照表數值待 James 以 NSCA《Essentials of Strength Training and Conditioning》原書核對（見設計規格）

/** NSCA %1RM–次數對照表：索引 = 次數 */
export const NSCA_PCT_1RM = { 1: 100, 2: 95, 3: 93, 4: 90, 5: 87, 6: 85, 7: 83, 8: 80, 9: 77, 10: 75, 11: 70, 12: 67, 15: 65 }
export const MAX_EFFECTIVE_REPS = 15
/** 等效次數在這個以內算「誤差較小」，優先採用 */
export const PREFERRED_MAX_REPS = 10

/** RPE 換算成等效次數；RPE 沒填回傳 null（視為熱身，不推估） */
export function effectiveReps(reps, rpe) {
  if (rpe == null || rpe === '') return null
  return Number(reps) + (10 - Number(rpe))
}

/** 某個（可能非整數的）等效次數對應的 %1RM；超出範圍回傳 null */
export function pctForReps(reps) {
  if (!(reps >= 1) || reps > MAX_EFFECTIVE_REPS) return null
  if (NSCA_PCT_1RM[reps] != null) return NSCA_PCT_1RM[reps]
  // 找前後兩個有值的格子線性內插（12 與 15 之間沒有表值）
  const keys = Object.keys(NSCA_PCT_1RM).map(Number).sort((a, b) => a - b)
  const hi = keys.find((k) => k > reps)
  const lo = keys.filter((k) => k < reps).at(-1)
  const t = (reps - lo) / (hi - lo)
  return NSCA_PCT_1RM[lo] + (NSCA_PCT_1RM[hi] - NSCA_PCT_1RM[lo]) * t
}

/** 單組推估 1RM（kg，一位小數）；不適合推估時回傳 null */
export function estimate1RM({ weight_kg, reps, rpe }) {
  const w = Number(weight_kg)
  if (!(w > 0) || !(Number(reps) > 0)) return null
  const pct = pctForReps(effectiveReps(reps, rpe))
  if (pct == null) return null
  return Math.round((w / (pct / 100)) * 10) / 10
}

/**
 * 一組資料（同一動作）的最佳推估：優先用等效 ≤ 10 下的組，沒有才用 11～15 下。
 * 回傳 { e1rm, precise } 或 null
 */
export function bestE1RM(sets) {
  let precise = null
  let loose = null
  for (const s of sets ?? []) {
    const v = estimate1RM(s)
    if (v == null) continue
    if (effectiveReps(s.reps, s.rpe) <= PREFERRED_MAX_REPS) precise = Math.max(precise ?? 0, v)
    else loose = Math.max(loose ?? 0, v)
  }
  if (precise != null) return { e1rm: precise, precise: true }
  if (loose != null) return { e1rm: loose, precise: false }
  return null
}

/**
 * 每次訓練、每個動作取最高推估值。
 * sessions: [{ session_date, sets: [{ exercise_id, weight_kg, reps, rpe }] }]
 * 回傳 { [exercise_id]: [{ date, e1rm }] }（依日期排序）
 */
export function e1rmHistory(sessions) {
  const out = {}
  for (const s of sessions ?? []) {
    const byEx = {}
    for (const set of s.sets ?? []) (byEx[set.exercise_id] ??= []).push(set)
    for (const [ex, sets] of Object.entries(byEx)) {
      const b = bestE1RM(sets)
      if (b) (out[ex] ??= []).push({ date: s.session_date, ...b })
    }
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.date.localeCompare(b.date))
  return out
}

/** 體脂率（%，一位小數）= 體脂肪重 ÷ 體重 */
export function bodyFatPct(row) {
  const w = Number(row?.weight_kg)
  const f = Number(row?.fat_kg)
  if (!(w > 0) || row?.fat_kg == null || !(f >= 0)) return null
  return Math.round((f / w) * 1000) / 10
}

/** 身體組成指標設定（客戶端圖表切換用） */
export const BODY_METRICS = [
  { key: 'weight_kg', label: '體重', unit: 'kg' },
  { key: 'muscle_kg', label: '骨骼肌', unit: 'kg' },
  { key: 'fat_kg', label: '體脂肪', unit: 'kg' },
  { key: 'fat_pct', label: '體脂率', unit: '%' },
  { key: 'visceral_level', label: '內臟脂肪', unit: '級' },
]

/** 取出某指標的值（體脂率用算的） */
export function metricValue(row, key) {
  if (key === 'fat_pct') return bodyFatPct(row)
  const v = row?.[key]
  return v == null || v === '' ? null : Number(v)
}

/** 最新一筆與前一筆的差異（依日期排序後比較）；不足兩筆回傳 null */
export function latestDelta(rows, key) {
  const vals = [...(rows ?? [])]
    .sort((a, b) => a.measured_on.localeCompare(b.measured_on))
    .map((r) => metricValue(r, key))
    .filter((v) => v != null)
  if (vals.length < 2) return null
  return Math.round((vals.at(-1) - vals.at(-2)) * 10) / 10
}

/** 由生日算年齡（以台北日期為準） */
export function ageFrom(birthday, today = new Date()) {
  if (!birthday) return null
  const t = new Date(today.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
  const [y, m, d] = birthday.split('-').map(Number)
  let age = t.getFullYear() - y
  if (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) age -= 1
  return age
}
