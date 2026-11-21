import { describe, expect, it } from 'vitest'
import {
  ageFrom, bodyFatPct, e1rmHistory, effectiveReps, estimate1RM, latestDelta, metricValue, pctForReps,
} from './strength'

describe('RPE 換算等效次數', () => {
  it('8 下 @RPE 8 = 10 下；沒填 RPE 視為力竭', () => {
    expect(effectiveReps(8, 8)).toBe(10)
    expect(effectiveReps(5, 9.5)).toBe(5.5)
    expect(effectiveReps(6, null)).toBe(6)
    expect(effectiveReps(6, '')).toBe(6)
  })
})

describe('NSCA 對照表', () => {
  it('整數次數直接查表', () => {
    expect(pctForReps(1)).toBe(100)
    expect(pctForReps(5)).toBe(87)
    expect(pctForReps(10)).toBe(75)
  })
  it('半格內插', () => {
    expect(pctForReps(5.5)).toBeCloseTo(86, 5)
  })
  it('超出 1～10 下回傳 null', () => {
    expect(pctForReps(10.5)).toBeNull()
    expect(pctForReps(0)).toBeNull()
  })
})

describe('單組 1RM 推估', () => {
  it('100 kg × 5 下 @RPE 10 → 100 / 0.87', () => {
    expect(estimate1RM({ weight_kg: 100, reps: 5, rpe: 10 })).toBe(114.9)
  })
  it('100 kg × 3 下 @RPE 8 → 等效 5 下，與上面相同', () => {
    expect(estimate1RM({ weight_kg: 100, reps: 3, rpe: 8 })).toBe(114.9)
  })
  it('等效超過 10 下、重量 0、次數 0 都不推估', () => {
    expect(estimate1RM({ weight_kg: 60, reps: 10, rpe: 7 })).toBeNull()
    expect(estimate1RM({ weight_kg: 0, reps: 5, rpe: 8 })).toBeNull()
    expect(estimate1RM({ weight_kg: 60, reps: 0, rpe: 8 })).toBeNull()
  })
})

describe('每次訓練取最高推估值', () => {
  it('依動作分組、依日期排序', () => {
    const h = e1rmHistory([
      { session_date: '2026-11-20', sets: [
        { exercise_id: 'sq', weight_kg: 100, reps: 5, rpe: 10 },
        { exercise_id: 'sq', weight_kg: 90, reps: 5, rpe: 10 },
        { exercise_id: 'bp', weight_kg: 60, reps: 15, rpe: 10 },
      ] },
      { session_date: '2026-11-13', sets: [{ exercise_id: 'sq', weight_kg: 95, reps: 5, rpe: 10 }] },
    ])
    expect(h.sq.map((p) => p.date)).toEqual(['2026-11-13', '2026-11-20'])
    expect(h.sq[1].e1rm).toBe(114.9)
    expect(h.bp).toBeUndefined() // 15 下不推估
  })
})

describe('身體組成', () => {
  const rows = [
    { measured_on: '2026-11-20', weight_kg: 80, fat_kg: 16, muscle_kg: 35 },
    { measured_on: '2026-11-01', weight_kg: 82, fat_kg: 18, muscle_kg: 34.5 },
  ]
  it('體脂率 = 體脂肪 ÷ 體重', () => {
    expect(bodyFatPct(rows[0])).toBe(20)
    expect(bodyFatPct({ weight_kg: 80 })).toBeNull()
    expect(metricValue(rows[1], 'fat_pct')).toBe(22)
  })
  it('與上次差異依日期比較', () => {
    expect(latestDelta(rows, 'weight_kg')).toBe(-2)
    expect(latestDelta(rows, 'muscle_kg')).toBe(0.5)
    expect(latestDelta(rows.slice(0, 1), 'weight_kg')).toBeNull()
  })
  it('年齡以台北日期計算', () => {
    expect(ageFrom('1990-11-22', new Date('2026-11-21T17:00:00Z'))).toBe(36) // 台北已 11/22
    expect(ageFrom('1990-11-23', new Date('2026-11-21T17:00:00Z'))).toBe(35)
  })
})
