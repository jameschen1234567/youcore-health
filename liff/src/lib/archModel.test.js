import { describe, expect, it } from 'vitest'
import { buildAssessment, classify, footPoints, insoleHint, judgeFoot, measureArch, nnht } from './archModel'

// 以 mm 設計的側面腳（y 向上），再轉成影像座標（y 向下、可鏡像、旋轉、縮放）
const FOOT = { heel: [0, 0], toe: [250, 0], mall: [62, 88], nav: [100, 46], mt1: [180, 22] }
const img = ({ mirror = 1, rot = 0, k = 4 } = {}) => Object.fromEntries(Object.entries(FOOT).map(([n, [x, y]]) => {
  const X = mirror * x * k, Y = -y * k
  return [n, [X * Math.cos(rot) - Y * Math.sin(rot) + 500, X * Math.sin(rot) + Y * Math.cos(rot) + 900]]
}))

describe('classify（Nilsson 2012 分界）', () => {
  it('平均值都是一般，含邊界', () => {
    expect([classify('fl', -1.9), classify('laa', 142), classify('nh', 4.6)]).toEqual([0, 0, 0])
    expect([classify('fl', -2.6), classify('fl', -1.2), classify('laa', 131), classify('laa', 152), classify('nh', 3.6), classify('nh', 5.5)]).toEqual([0, 0, 0, 0, 0, 0])
  })
  it('偏低與偏高', () => {
    expect([classify('nh', 3.5), classify('nh', 2.6), classify('nh', 5.6), classify('nh', 6.5)]).toEqual([-1, -2, 1, 2])
    expect([classify('fl', -2.7), classify('fl', -3.4), classify('fl', -1.1), classify('fl', -0.3)]).toEqual([-1, -2, 1, 2])
    expect([classify('laa', 130), classify('laa', 120), classify('laa', 153), classify('laa', 163)]).toEqual([-1, -2, 1, 2])
  })
  it('舟狀骨碰到連線（FL=0）屬於偏高，不是正常', () => expect(classify('fl', 0)).toBe(2))
})

describe('measureArch', () => {
  const base = measureArch(img(), 250).metrics
  it('數值合理', () => {
    expect(base.nh).toBe(4.6)
    expect(base.fl).toBeLessThan(0)
    expect(base.laa).toBeGreaterThan(90)
    expect(base.laa).toBeLessThan(180)
  })
  it('左右腳鏡像、手機歪、縮放都不影響', () => {
    for (const o of [{ mirror: -1 }, { rot: 0.15 }, { rot: -0.2, mirror: -1 }, { k: 2 }]) expect(measureArch(img(o), 250).metrics).toEqual(base)
  })
  it('舟狀骨在連線上方 → FL 為正、角度大於 180', () => {
    const p = img(); p.nav = [p.nav[0], 900 - 75 * 4]
    const m = measureArch(p, 250).metrics
    expect(m.fl).toBeGreaterThan(0)
    expect(m.laa).toBeGreaterThan(180)
  })
  it('標錯會擋下', () => {
    const p = img()
    expect(measureArch({ ...p, nav: p.mt1, mt1: p.nav }, 250).error).toContain('順序')
    expect(measureArch({ ...p, mall: [p.mall[0], p.nav[1] + 40] }, 250).error).toContain('內踝')
    expect(measureArch({ ...p, nav: null }, 250).error).toContain('還有點')
    expect(measureArch({ ...p, nav: [p.nav[0], 900 + 20] }, 250).error).toContain('高度')
  })
})

describe('judgeFoot', () => {
  it('取中位數', () => {
    const r = judgeFoot({ metrics: { fl: -2.8, laa: 128, nh: 4 } })
    expect(r.level).toBe(-1)
    expect(r.consistency).toBe('good')
  })
  it('互相矛盾 → 不一致', () => {
    expect(judgeFoot({ metrics: { fl: -3.5, laa: 155, nh: 4.6 } }).consistency).toBe('poor')
    expect(judgeFoot({ metrics: { fl: -2.8, laa: 128, nh: 3.4 }, footprint: 'high' }).consistency).toBe('poor')
    expect(judgeFoot({ metrics: { fl: -2.8, laa: 128, nh: 3.4 }, footprint: 'normal' }).consistency).toBe('partial')
  })
  it('尺量高度優先', () => expect(judgeFoot({ metrics: { fl: -1.9, laa: 142, nh: 4.6 }, navHeightMm: 30 }).items.at(-1)).toEqual({ key: 'nh', value: 3, level: -1 }))
  it('只有腳印、或什麼都沒有', () => {
    expect(judgeFoot({ footprint: 'low' })).toMatchObject({ level: -1, consistency: 'single' })
    expect(judgeFoot({})).toMatchObject({ level: null, consistency: 'none' })
  })
})

describe('buildAssessment', () => {
  const foot = { length_mm: 250, width_mm: 98 }
  const data = { feet: { left: foot, right: foot }, arch: { left: { points: img() }, right: { footprint: 'low' } }, insole: { length_mm: 260, widths: [[25, 60], [180, 95]] } }
  it('兩腳各自判定', () => {
    const r = buildAssessment(data, 40)
    expect(r.left.items).toHaveLength(3)
    expect(r.right.level).toBe(-1)
    expect(r.notes).toEqual([])
  })
  it('未成年不分級', () => expect(buildAssessment(data, 12).left.level).toBeNull())
  it('尺寸提醒', () => {
    const n = buildAssessment({ ...data, feet: { left: foot, right: { ...foot, length_mm: 265 } }, insole: { length_mm: 260, widths: [[25, 60], [180, 85]] } }, 40).notes.join()
    expect(n).toContain('左右足長差')
    expect(n).toContain('偏小')
    expect(n).toContain('會擠')
  })
})

it('後台參考值', () => {
  expect(insoleHint(-1, 20)).toMatchObject({ heightMm: 20, infill: 72 })
  expect(insoleHint(0, 20).heightMm).toBe(19)
  expect(insoleHint(0, null).heightMm).toBeNull()
  expect(insoleHint(null, 20)).toBeNull()
  expect(nnht(4.6, 180)).toBe(0.26)
  for (let l = 150; l <= 350; l++) { const p = footPoints(l); expect(new Set(p).size).toBe(5); expect(p.at(-1)).toBeLessThan(l) }
})
