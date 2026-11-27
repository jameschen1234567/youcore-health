import { describe, expect, it } from 'vitest'
import { calcIntake, dailySeries, dayTotals, searchFoods, validateFood, validateLog } from './diet'

const rice = { id: 'r', name: '白飯', portion_label: '1 碗', portion_g: 160, kcal_100g: 183, protein_100g: 3.1, kcal_portion: 292.8, protein_portion: 5, sort_order: 10, active: true }
const bento = { id: 'b', name: '雞腿便當', portion_label: '1 個', portion_g: null, kcal_100g: null, protein_100g: null, kcal_portion: 800, protein_portion: 35, sort_order: 2000, active: true }

describe('熱量計算', () => {
  it('份數', () => {
    expect(calcIntake(rice, 'portion', 1.5)).toEqual({ kcal: 439.2, protein_g: 7.5, amount_label: '1.5 × 1 碗（240 g）' })
    expect(calcIntake(bento, 'portion', 1)).toMatchObject({ kcal: 800, protein_g: 35, amount_label: '1 × 1 個' })
  })
  it('克數（只有每 100 克資料的才能用）', () => {
    expect(calcIntake(rice, 'gram', 200)).toEqual({ kcal: 366, protein_g: 6.2, amount_label: '200 g' })
    expect(calcIntake(bento, 'gram', 200)).toBeNull()
    expect(calcIntake(rice, 'portion', 0)).toBeNull()
  })
})

describe('搜尋與彙總', () => {
  it('開頭符合優先、停用不列', () => {
    const fs = [{ ...rice, name: '糙米白飯', id: 'x', sort_order: 1 }, rice, { ...bento, name: '白飯便當', active: false }]
    expect(searchFoods(fs, '白飯').map((f) => f.id)).toEqual(['r', 'x'])
    expect(searchFoods(fs, ' ')).toEqual([])
  })
  it('每日總量與近 7 天', () => {
    const logs = [{ eaten_on: '2026-11-28', kcal: 292.8, protein_g: 5 }, { eaten_on: '2026-11-28', kcal: 117, protein_g: null }, { eaten_on: '2026-11-25', kcal: 500, protein_g: 20 }]
    expect(dayTotals(logs.slice(0, 2))).toEqual({ kcal: 410, protein_g: 5 })
    const s = dailySeries(logs, '2026-11-28')
    expect(s).toHaveLength(7)
    expect(s[0].day).toBe('2026-11-22')
    expect(s.at(-1)).toEqual({ day: '2026-11-28', kcal: 410, protein_g: 5 })
    expect(s[3]).toEqual({ day: '2026-11-25', kcal: 500, protein_g: 20 })
  })
})

describe('驗證', () => {
  const ok = { eaten_on: '2026-11-28', meal: 'lunch', name: '便當', kcal: '800', protein_g: '' }
  it('紀錄', () => {
    expect(validateLog(ok, '2026-11-28')).toBeNull()
    expect(validateLog({ ...ok, eaten_on: '2026-11-29' }, '2026-11-28')).toMatch('未來')
    expect(validateLog({ ...ok, eaten_on: '2026-11-20' }, '2026-11-28')).toMatch('7 天')
    expect(validateLog({ ...ok, kcal: '' }, '2026-11-28')).toMatch('熱量')
  })
  it('外食品項要有來源', () => {
    const f = { name: '雞腿便當', portion_label: '1 個', kcal_portion: '800', protein_portion: '', source: '' }
    expect(validateFood(f)).toMatch('來源')
    expect(validateFood({ ...f, source: '店家標示' })).toBeNull()
  })
})
