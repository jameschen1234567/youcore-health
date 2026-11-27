import { describe, expect, it } from 'vitest'
import { heartLine, hrIntensity, hrMaxFromAge, validBpm, zoneOf } from './heart'

describe('heart', () => {
  it('Tanaka 最大心率', () => {
    expect(hrMaxFromAge(36)).toBe(183)
    expect(hrMaxFromAge(null)).toBeNull()
  })
  it('Karvonen 儲備心率', () => {
    const it1 = hrIntensity({ avg_hr: 150, max_hr: 172, rest_hr: 63, age: 36 })
    expect(it1).toMatchObject({ hrMax: 183, pct: 73, method: 'hrr', zone: 'Z3', maxPct: 94 })
  })
  it('沒有安靜心跳改用 %HRmax', () => {
    expect(hrIntensity({ avg_hr: 150, age: 36 })).toMatchObject({ pct: 82, method: 'hrmax', zone: 'Z4' })
  })
  it('資料不足回 null', () => {
    expect(hrIntensity({ avg_hr: 150, age: null })).toBeNull()
    expect(hrIntensity({ rest_hr: 60, age: 30 })).toBeNull()
  })
  it('區間邊界', () => {
    expect(zoneOf(90).zone).toBe('Z5')
    expect(zoneOf(59).zone).toBe('Z1')
    expect(zoneOf(40).zone).toBe('Z0')
  })
  it('摘要與驗證', () => {
    expect(heartLine({ avg_hr: 132, rest_hr: 68 }, 36)).toBe('平均 132 bpm · Z1 恢復')
    expect(heartLine({}, 36)).toBe('')
    expect(validBpm('', [30, 120])).toBe(true)
    expect(validBpm('62.5', [30, 120])).toBe(false)
    expect(validBpm(25, [30, 120])).toBe(false)
  })
})
