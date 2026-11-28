import { describe, expect, it } from 'vitest'
import { fmtSyncTime, isIOS, isStale, runShortcutUrl } from './healthSync'

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

describe('立即同步按鈕', () => {
  it('捷徑網址', () => {
    expect(runShortcutUrl('123-abc')).toBe('shortcuts://x-callback-url/run-shortcut?name=%E5%AE%A5%E8%8A%AF%E5%90%8C%E6%AD%A5&x-success=https%3A%2F%2Fliff.line.me%2F123-abc')
    expect(runShortcutUrl('')).toBe('shortcuts://x-callback-url/run-shortcut?name=%E5%AE%A5%E8%8A%AF%E5%90%8C%E6%AD%A5')
  })
  it('只有 iPhone／iPad', () => {
    expect(isIOS({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Line/14.0', platform: 'iPhone', maxTouchPoints: 5 })).toBe(true)
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Line/14.0', platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false)
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
  })
})
