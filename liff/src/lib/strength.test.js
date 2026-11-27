import { describe, expect, it } from 'vitest'
import {
  ageFrom, bestE1RM, bodyFatPct, e1rmHistory, effectiveReps, estimate1RM, latestDelta, metricValue, pctForReps,
} from './strength'

describe('RPE 換算等效次數', () => {
  it('8 下 @RPE 8 = 10 下；沒填 RPE 視為熱身（null）', () => {
    expect(effectiveReps(8, 8)).toBe(10)
    expect(effectiveReps(5, 9.5)).toBe(5.5)
    expect(effectiveReps(6, null)).toBeNull()
    expect(effectiveReps(6, '')).toBeNull()
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
  it('11～15 下：查表與 12～15 內插', () => {
    expect(pctForReps(11)).toBe(70)
    expect(pctForReps(12)).toBe(67)
    expect(pctForReps(13.5)).toBeCloseTo(66, 5)
    expect(pctForReps(15)).toBe(65)
  })
  it('超出 1～15 下回傳 null', () => {
    expect(pctForReps(15.5)).toBeNull()
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
  it('沒填 RPE、等效超過 15 下、重量 0、次數 0 都不推估', () => {
    expect(estimate1RM({ weight_kg: 70, reps: 3, rpe: null })).toBeNull()
    expect(estimate1RM({ weight_kg: 60, reps: 12, rpe: 6 })).toBeNull()
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
        { exercise_id: 'bp', weight_kg: 60, reps: 16, rpe: 10 },
      ] },
      { session_date: '2026-11-13', sets: [{ exercise_id: 'sq', weight_kg: 95, reps: 5, rpe: 10 }] },
    ])
    expect(h.sq.map((p) => p.date)).toEqual(['2026-11-13', '2026-11-20'])
    expect(h.sq[1].e1rm).toBe(114.9)
    expect(h.bp).toBeUndefined() // 16 下不推估
  })
})

describe('六角槓硬舉實例（2026-11-27）', () => {
  const sets = [
    { weight_kg: 20, reps: 10, rpe: null }, { weight_kg: 60, reps: 5, rpe: null }, { weight_kg: 70, reps: 3, rpe: null },
    { weight_kg: 80, reps: 10, rpe: 6.5 }, { weight_kg: 85, reps: 10, rpe: 8 },
  ]
  it('熱身組不列入，採用 85 × 10 @8（等效 12 下，67%）', () => {
    expect(bestE1RM(sets)).toEqual({ e1rm: 126.9, precise: false })
  })
  it('有 10 下以內的組時優先採用', () => {
    expect(bestE1RM([...sets, { weight_kg: 100, reps: 5, rpe: 8 }])).toEqual({ e1rm: 120.5, precise: true }) // 等效 7 下 → 83%
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
