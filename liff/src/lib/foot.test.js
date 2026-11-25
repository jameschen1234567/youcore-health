import { describe, expect, it } from 'vitest'
import { RANGES, buildReport, canClientDelete, checkWidths, footWarnings, insolePoints, insoleWarnings, parseCm, parseWidths, toCm, widthsToText } from './foot'

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
  it('mm 轉 cm', () => {
    expect(toCm(248.5)).toBe('24.9')
    expect(toCm('251.0')).toBe('25.1')
  })
})

describe('客戶自行刪除時限', () => {
  const now = Date.parse('2026-11-22T12:00:00Z')
  it('24 小時內可刪', () => {
    expect(canClientDelete({ created_at: '2026-11-22T00:00:00Z' }, now)).toBe(true)
    expect(canClientDelete({ created_at: '2026-11-21T12:00:01Z' }, now)).toBe(true)
  })
  it('超過 24 小時或沒有時間就不能刪', () => {
    expect(canClientDelete({ created_at: '2026-11-21T12:00:00Z' }, now)).toBe(false)
    expect(canClientDelete({ created_at: '2026-11-01T00:00:00Z' }, now)).toBe(false)
    expect(canClientDelete({}, now)).toBe(false)
  })
})

describe('手動量測', () => {
  it('公分轉 mm，接受全形與單位', () => {
    expect(parseCm('24.5', RANGES.length, '足長')).toEqual({ mm: 245 })
    expect(parseCm('２４．５ 公分', RANGES.length, '足長')).toEqual({ mm: 245 })
  })
  it('擋下空白、文字、公釐、超出範圍', () => {
    expect(parseCm('', RANGES.length, '足長').error).toContain('請填')
    expect(parseCm('abc', RANGES.length, '足長').error).toContain('數字')
    expect(parseCm('245', RANGES.length, '足長').error).toContain('24.5')
    expect(parseCm('90', RANGES.width, '前掌寬').error).toContain('9.0')
    expect(parseCm('3', RANGES.length, '足長').error).toContain('15–35')
  })
  it('量測位置依長度按比例、遞增且在長度內', () => {
    expect(insolePoints(275)).toEqual([25, 80, 130, 180, 225, 255, 265])
    for (let l = 150; l <= 350; l++) {
      const p = insolePoints(l)
      expect(checkWidths(p.map((x) => [x, 70]), l).error, `長度 ${l}`).toBeUndefined()
    }
  })
  it('寬度文字可來回轉換', () => {
    const w = [[25, 61], [80, 76], [133, 87], [181, 98]]
    expect(parseWidths(widthsToText(w), 275)).toEqual({ widths: w })
    expect(parseWidths('25:61\n80,76\n133 87\n181　98', 275).widths).toEqual(w)
  })
  it('寬度檢查', () => {
    expect(checkWidths([[25, 60]], 275).error).toContain('4 到 12')
    expect(checkWidths([[25, 60], [20, 70], [130, 80], [180, 90]], 275).error).toContain('依序')
    expect(checkWidths([[25, 60], [80, 70], [130, 80], [280, 90]], 275).error).toContain('超過')
    expect(checkWidths([[25, 6], [80, 70], [130, 80], [180, 90]], 275).error).toContain('不合理')
    expect(parseWidths('25 abc', 275).error).toContain('看不懂')
  })
  it('提醒但不擋', () => {
    expect(footWarnings({ length: 250, width: 98, heel: 62 })).toEqual([])
    expect(footWarnings({ length: 250, width: 62, heel: 98 })[0]).toContain('填反')
    expect(insoleWarnings([[25, 61], [80, 76], [130, 87], [180, 98], [225, 94], [255, 78], [265, 55]])).toEqual([])
    expect(insoleWarnings([[25, 61], [80, 110]])[0]).toContain('8 公分')
  })
})
