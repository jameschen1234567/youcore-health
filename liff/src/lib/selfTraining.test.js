import { describe, expect, it } from 'vitest'
import { sessionLoad, validateWorkout, weekStart, weeklySummary, weightProgress } from './selfTraining'

describe('session-RPE 訓練量', () => {
  it('時間 × RPE', () => expect(sessionLoad({ duration_min: 45, rpe: 7 })).toBe(315))
  it('週一起算', () => {
    expect(weekStart('2026-11-28')).toBe('2026-11-23') // 週六 → 週一
    expect(weekStart('2026-11-23')).toBe('2026-11-23')
    expect(weekStart('2026-11-29')).toBe('2026-11-23') // 週日
  })
  it('近 8 週彙總', () => {
    const w = weeklySummary([
      { done_on: '2026-11-28', duration_min: 30, rpe: 5 },
      { done_on: '2026-11-24', duration_min: 60, rpe: 7 },
      { done_on: '2026-11-17', duration_min: 20, rpe: 3 },
      { done_on: '2026-08-01', duration_min: 99, rpe: 9 }, // 太舊，不列入
    ], '2026-11-28')
    expect(w).toHaveLength(8)
    expect(w.at(-1)).toEqual({ week: '2026-11-23', load: 570, minutes: 90, count: 2 })
    expect(w.at(-2)).toMatchObject({ week: '2026-11-16', load: 60 })
    expect(w[0].week).toBe('2026-10-05')
  })
})

describe('驗證', () => {
  const ok = { done_on: '2026-11-28', kind: 'run', duration_min: '30', rpe: '6', sets: [] }
  it('基本欄位', () => {
    expect(validateWorkout(ok, '2026-11-28')).toBeNull()
    expect(validateWorkout({ ...ok, done_on: '2026-11-29' }, '2026-11-28')).toMatch('未來')
    expect(validateWorkout({ ...ok, done_on: '2026-10-28' }, '2026-11-28')).toMatch('30 天')
    expect(validateWorkout({ ...ok, duration_min: '0' }, '2026-11-28')).toMatch('時間')
    expect(validateWorkout({ ...ok, rpe: '' }, '2026-11-28')).toMatch('強度')
  })
  it('重訓組數要完整', () => {
    const s = { ...ok, kind: 'strength' }
    expect(validateWorkout({ ...s, sets: [{ exercise_id: 'a', weight_kg: '40', reps: '' }] }, '2026-11-28')).toMatch('沒填完整')
    expect(validateWorkout({ ...s, sets: [{ exercise_id: 'a', weight_kg: '40', reps: '8' }] }, '2026-11-28')).toBeNull()
  })
})

describe('目標體重進度', () => {
  const rows = [
    { measured_on: '2026-11-20', weight_kg: 82 },
    { measured_on: '2026-10-01', weight_kg: 86 },
    { measured_on: '2026-11-01', weight_kg: null },
  ]
  it('減重', () => {
    expect(weightProgress(rows, 75)).toEqual({ target: 75, start: 86, current: 82, remaining: 7, pct: 36, reached: false, measured_on: '2026-11-20' })
  })
  it('增重與達成', () => {
    expect(weightProgress(rows, 80)).toMatchObject({ remaining: 2, pct: 67 })
    expect(weightProgress([{ measured_on: '2026-01-01', weight_kg: 60 }, { measured_on: '2026-02-01', weight_kg: 63 }], 62)).toMatchObject({ reached: true, pct: 100 })
  })
  it('沒有目標或沒有量測', () => {
    expect(weightProgress(rows, null)).toBeNull()
    expect(weightProgress([], 70)).toEqual({ target: 70, current: null })
  })
})
