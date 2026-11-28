import { describe, expect, it } from 'vitest'
import { fmtSyncTime, isStale } from './healthSync'

describe('同步時間', () => {
  it('台北時間格式', () => {
    expect(fmtSyncTime('2026-11-28T14:01:00Z')).toBe('11/28 22:01')
    expect(fmtSyncTime('2026-11-28T16:05:00Z')).toBe('11/29 00:05')
    expect(fmtSyncTime(null)).toBeNull()
  })
  it('超過 2 天算太久', () => {
    const now = new Date('2026-11-28T14:00:00Z')
    expect(isStale('2026-11-27T14:00:00Z', now)).toBe(false)
    expect(isStale('2026-11-26T13:00:00Z', now)).toBe(true)
    expect(isStale(null, now)).toBe(false)
  })
})
