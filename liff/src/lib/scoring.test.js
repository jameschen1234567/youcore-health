import { describe, it, expect } from 'vitest'
import { NA, isValidAnswer, retestDue, scoreQuestionnaire } from './scoring'
import { QUESTIONNAIRES } from '../questionnaires'

// 測試用小量表：A 分量表 2 題、B 分量表 2 題，0–10，允許不適用，至少答一半
const cfg = {
  key: 't',
  scale: { min: 0, max: 10, allowNA: true },
  subscales: [{ key: 'a' }, { key: 'b' }],
  items: [
    { id: 'a1', subscale: 'a' }, { id: 'a2', subscale: 'a' },
    { id: 'b1', subscale: 'b' }, { id: 'b2', subscale: 'b' },
  ],
  scoring: { method: 'percent_of_max', minAnsweredRatio: 0.5, total: true },
}

describe('scoreQuestionnaire percent_of_max', () => {
  it('all answered', () => {
    const r = scoreQuestionnaire(cfg, { a1: 10, a2: 0, b1: 5, b2: 5 })
    expect(r.subscales.a.score).toBe(50)
    expect(r.subscales.b.score).toBe(50)
    expect(r.total.score).toBe(50)
    expect(r.computable).toBe(true)
  })

  it('NA items are excluded from the denominator', () => {
    const r = scoreQuestionnaire(cfg, { a1: 6, a2: NA, b1: 3, b2: 3 })
    expect(r.subscales.a).toEqual({ score: 60, answered: 1, total: 2, computable: true })
    expect(r.total.score).toBe(40) // 12 / 30
  })

  it('below minAnsweredRatio is not computable', () => {
    const r = scoreQuestionnaire(cfg, { a1: NA, a2: NA, b1: 3, b2: 3 })
    expect(r.subscales.a.computable).toBe(false)
    expect(r.subscales.a.score).toBeNull()
    expect(r.subscales.b.score).toBe(30)
    expect(r.computable).toBe(false)
  })

  it('rounds to one decimal', () => {
    const r = scoreQuestionnaire(cfg, { a1: 1, a2: 0, b1: 0, b2: 0 })
    expect(r.subscales.a.score).toBe(5)
    expect(scoreQuestionnaire({ ...cfg, scale: { min: 0, max: 3 } }, { a1: 1, a2: 0, b1: 0, b2: 0 }).subscales.a.score).toBe(16.7)
  })

  it('respects per-item scale override with non-zero min', () => {
    const c = { ...cfg, items: cfg.items.map((it) => (it.id === 'a1' ? { ...it, scale: { min: 1, max: 5 } } : it)) }
    // a1: (3-1)/(5-1)=2/4, a2: 5/10 → 7/14 = 50
    expect(scoreQuestionnaire(c, { a1: 3, a2: 5, b1: 0, b2: 0 }).subscales.a.score).toBe(50)
  })

  it('rejects invalid answers', () => {
    expect(() => scoreQuestionnaire(cfg, { a1: 11 })).toThrow()
    expect(() => scoreQuestionnaire(cfg, { a1: 2.5 })).toThrow()
    expect(() => scoreQuestionnaire(cfg, { zz: 1 })).toThrow()
    expect(() => scoreQuestionnaire({ ...cfg, scale: { min: 0, max: 10, allowNA: false } }, { a1: NA })).toThrow()
  })
})

describe('scoreQuestionnaire single', () => {
  const nrs = QUESTIONNAIRES.nrs
  it('returns the value', () => {
    expect(scoreQuestionnaire(nrs, { [nrs.items[0].id]: 7 }).total.score).toBe(7)
  })
  it('unanswered is not computable', () => {
    expect(scoreQuestionnaire(nrs, {}).computable).toBe(false)
  })
})

describe('isValidAnswer', () => {
  it('checks range, integer and NA', () => {
    expect(isValidAnswer(cfg, cfg.items[0], 0)).toBe(true)
    expect(isValidAnswer(cfg, cfg.items[0], 10)).toBe(true)
    expect(isValidAnswer(cfg, cfg.items[0], -1)).toBe(false)
    expect(isValidAnswer(cfg, cfg.items[0], NA)).toBe(true)
  })
})

describe('retestDue', () => {
  const now = new Date('2026-11-20T00:00:00Z')
  it('due after 28 days', () => {
    expect(retestDue('2026-10-23T00:00:00Z', now)).toBe(true)
    expect(retestDue('2026-10-24T00:00:01Z', now)).toBe(false)
    expect(retestDue(null, now)).toBe(false)
  })
})

describe('questionnaire configs', () => {
  it.each(Object.values(QUESTIONNAIRES))('$key is well-formed', (q) => {
    expect(q.items.length).toBeGreaterThan(0)
    const ids = q.items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    const subs = new Set((q.subscales ?? []).map((s) => s.key))
    if (q.scoring.method === 'percent_of_max') {
      for (const it of q.items) expect(subs.has(it.subscale)).toBe(true)
    }
  })

  it('FFI-TC is still a placeholder (must be replaced before release)', () => {
    // 正式題目取得後：替換題目、把 placeholder 改成 false、刪掉這個測試
    expect(QUESTIONNAIRES['ffi-tc'].placeholder).toBe(true)
  })
})
