// 心率：每日安靜心跳（客戶自己填）＋ 訓練強度區間推估
// 最大心率：Tanaka 2001，HRmax = 208 − 0.7 × 年齡
// 強度：Karvonen 儲備心率法 %HRR =（平均心率 − 安靜心跳）÷（最大心率 − 安靜心跳）
//       沒有安靜心跳時退回 %HRmax = 平均心率 ÷ 最大心率（僅供參考）
import { DEMO } from '../config'
import { supabase } from './supabase'
import { demoList, demoSet } from './api'

export const REST_RANGE = [30, 120]
export const HR_RANGE = [40, 230]

export const ZONES = [
  { min: 90, zone: 'Z5', label: '高強度', color: '#c0392b' },
  { min: 80, zone: 'Z4', label: '閾值', color: '#e67e22' },
  { min: 70, zone: 'Z3', label: '有氧', color: '#d4a017' },
  { min: 60, zone: 'Z2', label: '燃脂有氧', color: '#27ae60' },
  { min: 50, zone: 'Z1', label: '恢復', color: '#2e86c1' },
]

export const hrMaxFromAge = (age) => (age == null || age < 5 || age > 110 ? null : Math.round(208 - 0.7 * age))

export function zoneOf(pct) {
  if (pct == null) return null
  return ZONES.find((z) => pct >= z.min) ?? { zone: 'Z0', label: '低於 Z1', color: '#95a5a6' }
}

/**
 * 推估訓練強度。回傳 null 表示資料不足（沒有平均心率或年齡）。
 * { hrMax, pct, method: 'hrr' | 'hrmax', zone, label, color, maxPct }
 */
export function hrIntensity({ avg_hr, max_hr, rest_hr, age }) {
  const hrMax = hrMaxFromAge(age)
  if (!avg_hr || !hrMax) return null
  const useHrr = rest_hr && rest_hr < hrMax
  const pct = useHrr
    ? Math.round(((avg_hr - rest_hr) / (hrMax - rest_hr)) * 100)
    : Math.round((avg_hr / hrMax) * 100)
  const maxPct = max_hr ? Math.round((max_hr / hrMax) * 100) : null
  return { hrMax, pct, method: useHrr ? 'hrr' : 'hrmax', maxPct, ...zoneOf(pct) }
}

/** 一行摘要，給列表用：「平均 132 bpm · Z3 有氧」 */
export function heartLine(s, age) {
  if (!s.avg_hr) return ''
  const it = hrIntensity({ ...s, age })
  return `平均 ${s.avg_hr} bpm${it ? ` · ${it.zone} ${it.label}` : ''}`
}

export const validBpm = (v, [lo, hi]) => v === '' || v == null || (Number.isInteger(Number(v)) && Number(v) >= lo && Number(v) <= hi)

// ── 每日安靜心跳 ────────────────────────────────────────────────────────────

/** 舊的在前 [{ measured_on, bpm }] */
export async function listRestingHr(profileId) {
  if (DEMO) return demoList(`rhr:${profileId}`).sort((a, b) => a.measured_on.localeCompare(b.measured_on))
  const { data, error } = await supabase.from('resting_hr').select('measured_on, bpm')
    .eq('profile_id', profileId).order('measured_on', { ascending: true })
  if (error) throw error
  return data
}

/** 一天一筆，同一天再填就覆蓋 */
export async function saveRestingHr(profileId, measured_on, bpm) {
  const n = Number(bpm)
  if (!Number.isInteger(n) || n < REST_RANGE[0] || n > REST_RANGE[1]) throw new Error('BAD_BPM')
  if (DEMO) {
    const rows = demoList(`rhr:${profileId}`).filter((r) => r.measured_on !== measured_on)
    demoSet(`rhr:${profileId}`, [...rows, { measured_on, bpm: n }])
    return
  }
  const { error } = await supabase.from('resting_hr')
    .upsert({ profile_id: profileId, measured_on, bpm: n }, { onConflict: 'profile_id,measured_on' })
  if (error) throw error
}
