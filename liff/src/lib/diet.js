// 飲食紀錄（會員限定）、食物熱量參考清單、每日目標。規則見 supabase/migrations/0035_food_logs.sql
import { DEMO } from '../config'
import { supabase } from './supabase'
import { demoGet, demoList, demoSet } from './api'

const unwrap = ({ data, error }) => { if (error) throw error; return data }
export const todayTaipei = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())
const addDays = (d, n) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
export const MEALS = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '點心' }
export const MAX_BACK_DAYS = 7
export const PORTION_STEPS = [0.5, 1, 1.5, 2, 2.5, 3]
const r1 = (n) => Math.round(n * 10) / 10

// ── 純函式 ──────────────────────────────────────────────────────────────────

/** 依份數或克數算熱量與蛋白質。mode: 'portion' | 'gram' */
export function calcIntake(food, mode, qty) {
  const q = Number(qty)
  if (!(q > 0)) return null
  if (mode === 'gram') {
    if (food.kcal_100g == null) return null
    return {
      kcal: r1((Number(food.kcal_100g) * q) / 100),
      protein_g: food.protein_100g == null ? null : r1((Number(food.protein_100g) * q) / 100),
      amount_label: `${q} g`,
    }
  }
  return {
    kcal: r1(Number(food.kcal_portion) * q),
    protein_g: food.protein_portion == null ? null : r1(Number(food.protein_portion) * q),
    amount_label: `${q} × ${food.portion_label}${food.portion_g ? `（${r1(food.portion_g * q)} g）` : ''}`,
  }
}

/** 搜尋：名稱包含關鍵字（不分大小寫），名稱開頭符合的排前面 */
export function searchFoods(foods, q, limit = 20) {
  const k = q.trim().toLowerCase()
  if (!k) return []
  return foods.filter((f) => f.active !== false && f.name.toLowerCase().includes(k))
    .sort((a, b) => (b.name.toLowerCase().startsWith(k) - a.name.toLowerCase().startsWith(k)) || a.sort_order - b.sort_order)
    .slice(0, limit)
}

export function dayTotals(logs) {
  const t = { kcal: 0, protein_g: 0 }
  for (const l of logs) { t.kcal += Number(l.kcal); t.protein_g += Number(l.protein_g ?? 0) }
  return { kcal: Math.round(t.kcal), protein_g: r1(t.protein_g) }
}

/** 近 n 天（含今天）每日總熱量，舊的在前 */
export function dailySeries(logs, today = todayTaipei(), days = 7) {
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(today, -(days - 1 - i))
    return { day: d, ...dayTotals(logs.filter((l) => l.eaten_on === d)) }
  })
}

export function validateLog(v, today = todayTaipei()) {
  if (!v.eaten_on || v.eaten_on > today) return '日期不能是未來'
  if (v.eaten_on < addDays(today, -MAX_BACK_DAYS)) return `只能補記 ${MAX_BACK_DAYS} 天內的飲食`
  if (!MEALS[v.meal]) return '請選餐別'
  if (!v.name?.trim()) return '請填食物名稱'
  if (v.name.trim().length > 60) return '名稱最多 60 字'
  const k = Number(v.kcal)
  if (v.kcal === '' || !(k >= 0 && k <= 5000)) return '熱量請填 0～5000 大卡'
  if (v.protein_g !== '' && v.protein_g != null && !(Number(v.protein_g) >= 0 && Number(v.protein_g) <= 500)) return '蛋白質請填 0～500 克'
  return null
}

export function validateFood(v) {
  if (!v.name?.trim()) return '請填名稱'
  if (!v.portion_label?.trim()) return '請填份量（例如 1 個便當）'
  const k = Number(v.kcal_portion)
  if (v.kcal_portion === '' || !(k >= 0 && k <= 5000)) return '每份熱量請填 0～5000'
  if (v.protein_portion !== '' && v.protein_portion != null && !(Number(v.protein_portion) >= 0 && Number(v.protein_portion) <= 500)) return '蛋白質請填 0～500'
  if (!v.source?.trim()) return '請填資料來源（例如：店家標示、營養師估算）'
  return null
}

// ── 食物清單 ────────────────────────────────────────────────────────────────

const FOOD_FIELDS = 'id, name, category, portion_label, portion_g, kcal_100g, protein_100g, kcal_portion, protein_portion, source, source_ref, is_custom, active, sort_order'
const DEMO_FOODS = [
  { id: 'f1', name: '白飯', category: '主食', portion_label: '1 碗', portion_g: 160, kcal_100g: 183, protein_100g: 3.1, kcal_portion: 292.8, protein_portion: 5, source: '食藥署食品營養成分資料集：白飯', source_ref: 'A0550601', is_custom: false, active: true, sort_order: 10 },
  { id: 'f2', name: '雞胸肉（去皮）', category: '蛋白質', portion_label: '1 掌心', portion_g: 100, kcal_100g: 117, protein_100g: 23.3, kcal_portion: 117, protein_portion: 23.3, source: '食藥署食品營養成分資料集：去皮清肉(肉雞)', source_ref: 'I0402402', is_custom: false, active: true, sort_order: 270 },
  { id: 'f3', name: '香蕉', category: '水果', portion_label: '1 根（可食部分）', portion_g: 100, kcal_100g: 85, protein_100g: 1.5, kcal_portion: 85, protein_portion: 1.5, source: '食藥署食品營養成分資料集：北蕉平均值', source_ref: 'D08001', is_custom: false, active: true, sort_order: 670 },
]

export async function listFoods({ all = false } = {}) {
  if (DEMO) return [...DEMO_FOODS, ...demoList('foods')].filter((f) => all || f.active)
  let q = supabase.from('foods').select(FOOD_FIELDS)
  if (!all) q = q.eq('active', true)
  return unwrap(await q.order('sort_order').order('name'))
}

export async function adminSaveFood(v) {
  const row = {
    name: v.name.trim(), category: v.category?.trim() || '外食', portion_label: v.portion_label.trim(),
    portion_g: v.portion_g === '' || v.portion_g == null ? null : Number(v.portion_g),
    kcal_portion: Number(v.kcal_portion),
    protein_portion: v.protein_portion === '' || v.protein_portion == null ? null : Number(v.protein_portion),
    source: v.source.trim(), is_custom: true, sort_order: 2000,
  }
  if (DEMO) {
    const list = demoList('foods')
    demoSet('foods', v.id ? list.map((f) => (f.id === v.id ? { ...f, ...row } : f)) : [...list, { id: crypto.randomUUID(), ...row, active: true }])
    return
  }
  unwrap(await (v.id ? supabase.from('foods').update(row).eq('id', v.id) : supabase.from('foods').insert(row)))
}

export async function adminSetFoodActive(id, active) {
  if (DEMO) return demoSet('foods', demoList('foods').map((f) => (f.id === id ? { ...f, active } : f)))
  unwrap(await supabase.from('foods').update({ active }).eq('id', id))
}

// ── 飲食紀錄 ────────────────────────────────────────────────────────────────

const LOG_FIELDS = 'id, eaten_on, meal, food_id, name, amount_label, kcal, protein_g, created_at'

/** 某天起到今天的紀錄 */
export async function listFoodLogs(profileId, fromDay) {
  if (DEMO) return demoList(`food:${profileId}`).filter((l) => l.eaten_on >= fromDay).sort((a, b) => a.created_at.localeCompare(b.created_at))
  return unwrap(await supabase.from('food_logs').select(LOG_FIELDS).eq('profile_id', profileId).gte('eaten_on', fromDay)
    .order('eaten_on').order('created_at'))
}

export async function saveFoodLog(profileId, v) {
  const row = {
    eaten_on: v.eaten_on, meal: v.meal, food_id: v.food_id ?? null, name: v.name.trim(),
    amount_label: v.amount_label?.trim() || null, kcal: Number(v.kcal),
    protein_g: v.protein_g === '' || v.protein_g == null ? null : Number(v.protein_g),
  }
  if (DEMO) {
    const list = demoList(`food:${profileId}`)
    demoSet(`food:${profileId}`, v.id ? list.map((l) => (l.id === v.id ? { ...l, ...row } : l)) : [...list, { id: crypto.randomUUID(), ...row, created_at: new Date().toISOString() }])
    return
  }
  unwrap(await (v.id ? supabase.from('food_logs').update(row).eq('id', v.id) : supabase.from('food_logs').insert({ profile_id: profileId, ...row })))
}

export async function deleteFoodLog(profileId, id) {
  if (DEMO) return demoSet(`food:${profileId}`, demoList(`food:${profileId}`).filter((l) => l.id !== id))
  unwrap(await supabase.from('food_logs').delete().eq('id', id))
}

// ── 目標 ──────────────────────────────────────────────────────────────────

export async function getDietTarget(profileId) {
  if (DEMO) return demoGet(`diet-target:${profileId}`) ?? { diet_kcal_target: null, diet_protein_target: null }
  return unwrap(await supabase.from('profiles').select('diet_kcal_target, diet_protein_target').eq('id', profileId).single())
}

export async function adminSetDietTarget(profileId, kcal, protein) {
  const row = {
    diet_kcal_target: kcal === '' || kcal == null ? null : Math.round(Number(kcal)),
    diet_protein_target: protein === '' || protein == null ? null : Math.round(Number(protein)),
  }
  if (row.diet_kcal_target != null && !(row.diet_kcal_target >= 800 && row.diet_kcal_target <= 6000)) throw new Error('BAD_KCAL')
  if (row.diet_protein_target != null && !(row.diet_protein_target >= 10 && row.diet_protein_target <= 400)) throw new Error('BAD_PROTEIN')
  if (DEMO) return demoSet(`diet-target:${profileId}`, row)
  unwrap(await supabase.from('profiles').update(row).eq('id', profileId))
}
