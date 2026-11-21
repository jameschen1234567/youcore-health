import { describe, expect, it } from 'vitest'
import { buildReport, footErrorMessage, toCm } from './foot'

const row = (side, length_mm, created_at, quality_flags = []) => ({ side, length_mm, width_mm: 95, created_at, quality_flags })

describe('buildReport', () => {
  it('沒有紀錄', () => {
    const r = buildReport([])
    expect(r.complete).toBe(false)
    expect(r.lengthDiff).toBeNull()
  })

  it('各取左右腳最新一筆', () => {
    const r = buildReport([
      row('left', 240, '2026-11-01T00:00:00Z'),
      row('left', 248, '2026-11-20T00:00:00Z'),
      row('right', 250, '2026-11-20T00:00:00Z'),
    ])
    expect(r.complete).toBe(true)
    expect(r.left.length_mm).toBe(248)
    expect(r.lengthDiff).toBe(2)
    expect(r.diffWarning).toBe(false)
  })

  it('左右差超過 10 mm 要提示', () => {
    const r = buildReport([row('left', 238, 'a'), row('right', 250.5, 'a')])
    expect(r.lengthDiff).toBe(12.5)
    expect(r.diffWarning).toBe(true)
  })

  it('剛好 10 mm 不提示', () => {
    expect(buildReport([row('left', 240, 'a'), row('right', 250, 'a')]).diffWarning).toBe(false)
  })

  it('只有一隻腳', () => {
    const r = buildReport([row('left', 240, 'a')])
    expect(r.complete).toBe(false)
    expect(r.right).toBeNull()
  })

  it('合併兩腳的品質提示且不重複', () => {
    const r = buildReport([row('left', 240, 'a', ['LOW_RESOLUTION']), row('right', 241, 'a', ['LOW_RESOLUTION', 'FOOT_ROTATED'])])
    expect(r.flags).toEqual(['LOW_RESOLUTION', 'FOOT_ROTATED'])
  })
})

describe('其他', () => {
  it('錯誤碼有對應提示，未知碼有通用提示', () => {
    expect(footErrorMessage('TOO_OBLIQUE')).toContain('正上方')
    expect(footErrorMessage('HTTP_500')).toContain('量測失敗')
  })

  it('mm 轉 cm', () => {
    expect(toCm(248.5)).toBe('24.9')
    expect(toCm('251.0')).toBe('25.1')
  })
})
