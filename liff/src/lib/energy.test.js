import { describe, expect, it } from 'vitest'
import { coachSessionKcal, dayBalance, latestWeight, metKcal, mifflin, selfWorkoutKcal, validateActivity } from './energy'

describe('Mifflin-St Jeor 基礎代謝', () => {
  it('男女公式', () => {
    // 10×82 + 6.25×170 − 5×36 + 5 = 820 + 1062.5 − 180 + 5 = 1707.5 → 1708
    expect(mifflin({ weight_kg: 82, height_cm: 170, age: 36, gender: 'male' })).toBe(1708)
    // 10×60 + 6.25×160 − 5×30 − 161 = 600 + 1000 − 150 − 161 = 1289
    expect(mifflin({ weight_kg: 60, height_cm: 160, age: 30, gender: 'female' })).toBe(1289)
  })
  it('資料不足或性別其他', () => {
    expect(mifflin({ weight_kg: 82, height_cm: null, age: 36, gender: 'male' })).toBeNull()
    expect(mifflin({ weight_kg: 82, height_cm: 170, age: 36, gender: 'other' })).toBeNull()
  })
})

describe('MET 運動消耗', () => {
  it('MET × kg × 時數', () => expect(metKcal(3.5, 80, 60)).toBe(280))
  it('自主訓練依 RPE 選強度', () => {
    expect(selfWorkoutKcal({ kind: 'strength', rpe: 6, duration_min: 60 }, 80)).toMatchObject({ kcal: 280, code: '02054' })
    expect(selfWorkoutKcal({ kind: 'strength', rpe: 7, duration_min: 60 }, 80)).toMatchObject({ kcal: 480, code: '02050' })
    expect(selfWorkoutKcal({ kind: 'walk', rpe: 4, duration_min: 30 }, 80)).toMatchObject({ kcal: 152, code: '17190' })
    expect(selfWorkoutKcal({ kind: 'other', rpe: 5, duration_min: 30 }, 80)).toBeNull()
    expect(selfWorkoutKcal({ kind: 'run', rpe: 5, duration_min: 30 }, null)).toBeNull()
  })
  it('教練課：平均 RPE ≥ 8 算高強度；沒填分鐘不算', () => {
    const s = { duration_min: 60, sets: [{ rpe: 8 }, { rpe: 9 }, { rpe: null }] }
    expect(coachSessionKcal(s, 80)).toMatchObject({ kcal: 480, code: '02050' })
    expect(coachSessionKcal({ ...s, sets: [{ rpe: 7 }, { rpe: 8 }] }, 80)).toMatchObject({ kcal: 280, code: '02054' })
    expect(coachSessionKcal({ ...s, sets: [] }, 80)).toMatchObject({ code: '02054' })
    expect(coachSessionKcal({ duration_min: null, sets: [] }, 80)).toBeNull()
  })
})

describe('每日收支', () => {
  const workouts = [{ name: '重訓', kcal: 280 }, { name: '走路', kcal: 152 }]
  it('有手機活動熱量就用手機', () => {
    expect(dayBalance({ bmr: 1708, intake: 1900, activity: { active_kcal: 600 }, workouts }))
      .toMatchObject({ active: 600, activeSource: 'phone', workoutKcal: 432, burn: 2308, balance: -408 })
  })
  it('沒填手機用訓練推估', () => {
    expect(dayBalance({ bmr: 1708, intake: 1900, activity: { steps: 8000 }, workouts }))
      .toMatchObject({ active: 432, activeSource: 'workouts', burn: 2140, balance: -240 })
  })
  it('沒有基礎代謝就不算收支', () => {
    expect(dayBalance({ bmr: null, intake: 1900, activity: undefined, workouts: [] })).toMatchObject({ burn: null, balance: null })
  })
  it('最新店內體重', () => {
    expect(latestWeight([{ measured_on: '2026-11-20', weight_kg: 82 }, { measured_on: '2026-10-01', weight_kg: 86 }])).toEqual({ kg: 82, on: '2026-11-20' })
    expect(latestWeight([])).toBeNull()
  })
})

describe('活動資料驗證', () => {
  it('範圍與日期', () => {
    expect(validateActivity({ day: '2026-11-28', steps: '8000', active_kcal: '' }, '2026-11-28')).toBeNull()
    expect(validateActivity({ day: '2026-11-28', steps: '', active_kcal: '' }, '2026-11-28')).toMatch('至少')
    expect(validateActivity({ day: '2026-11-29', steps: '1', active_kcal: '' }, '2026-11-28')).toMatch('未來')
    expect(validateActivity({ day: '2026-11-20', steps: '1', active_kcal: '' }, '2026-11-28')).toMatch('7 天')
    expect(validateActivity({ day: '2026-11-28', steps: '1.5', active_kcal: '' }, '2026-11-28')).toMatch('步數')
  })
})
