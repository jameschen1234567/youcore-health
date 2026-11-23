import { describe, expect, it } from 'vitest'
import { bookingDates, bookingErrorText, buildSlots, canClientChange, fmtSlot, startTimes, taipei, usedTrials } from './booking'

const svc60 = { id: 's', duration_min: 60, buffer_min: 10 }
const svc90 = { id: 'r', duration_min: 90, buffer_min: 10 }
// 2026-11-24 是週二
const NOW = taipei('2026-11-23', '09:00')

describe('startTimes', () => {
  it('60 分服務最後一格 19:30（結束 20:30）', () => {
    const t = startTimes(60)
    expect(t[0]).toBe('10:00')
    expect(t.at(-1)).toBe('19:30')
  })
  it('90 分服務最後一格 19:00', () => expect(startTimes(90).at(-1)).toBe('19:00'))
})

describe('buildSlots', () => {
  it('週一公休沒有時段', () => expect(buildSlots('2026-11-30', svc60, [], NOW)).toEqual([]))
  it('3 小時內的時段不可選', () => {
    const s = buildSlots('2026-11-23', svc60, [], NOW) // 週一 → 空；改用週二早上
    expect(s).toEqual([])
    const tue = buildSlots('2026-11-24', svc60, [], taipei('2026-11-24', '09:00'))
    expect(tue.find((x) => x.time === '11:30').state).toBe('past')
    expect(tue.find((x) => x.time === '12:00').state).toBe('free')
  })
  it('開始時間被佔用顯示 taken，接不上的顯示 short', () => {
    const busy = [{ starts_at: taipei('2026-11-24', '14:00').toISOString(), ends_at: taipei('2026-11-24', '15:10').toISOString() }]
    const s = buildSlots('2026-11-24', svc60, busy, NOW)
    const st = (t) => s.find((x) => x.time === t).state
    expect(st('13:00')).toBe('short') // 13:00–14:10 撞到 14:00，但 13:00 本身沒人約
    expect(st('12:30')).toBe('free') // 12:30–13:40
    expect(st('14:00')).toBe('taken')
    expect(st('14:30')).toBe('taken')
    expect(st('15:00')).toBe('taken') // 15:00 < 15:10
    expect(st('15:30')).toBe('free')
  })
  it('自己的緩衝也算：90 分 + 10 分', () => {
    const busy = [{ starts_at: taipei('2026-11-24', '12:00').toISOString(), ends_at: taipei('2026-11-24', '13:00').toISOString() }]
    const s = buildSlots('2026-11-24', svc90, busy, NOW)
    expect(s.find((x) => x.time === '10:30').state).toBe('short') // 10:30–12:10
    expect(s.find((x) => x.time === '10:00').state).toBe('free') // 10:00–11:40
  })
  it('緩衝 0 時可以緊接著前一筆', () => {
    const busy = [{ starts_at: taipei('2026-11-24', '12:00').toISOString(), ends_at: taipei('2026-11-24', '13:00').toISOString() }]
    const s = buildSlots('2026-11-24', { duration_min: 60, buffer_min: 0 }, busy, NOW)
    expect(s.find((x) => x.time === '11:00').state).toBe('free')
    expect(s.find((x) => x.time === '13:00').state).toBe('free')
  })
  it('改期時忽略自己原本那筆', () => {
    const mine = { starts_at: taipei('2026-11-24', '14:00').toISOString(), ends_at: taipei('2026-11-24', '15:10').toISOString() }
    const s = buildSlots('2026-11-24', svc60, [mine], NOW, mine)
    expect(s.find((x) => x.time === '14:00').state).toBe('free')
  })
})

describe('canClientChange', () => {
  const b = (h) => ({ status: 'booked', starts_at: new Date(NOW.getTime() + h * 3600e3).toISOString() })
  it('超過 24 小時可改', () => expect(canClientChange(b(25), NOW)).toBe(true))
  it('24 小時內不可改', () => expect(canClientChange(b(23.5), NOW)).toBe(false))
  it('已取消不可改', () => expect(canClientChange({ ...b(48), status: 'cancelled' }, NOW)).toBe(false))
})

describe('格式與錯誤', () => {
  it('fmtSlot 用台北時間', () => expect(fmtSlot('2026-11-25T06:00:00Z')).toBe('11/25（三）14:00'))
  it('bookingDates 含 31 天且標出週一', () => {
    const d = bookingDates(NOW)
    expect(d).toHaveLength(31)
    expect(d[0]).toMatchObject({ date: '2026-11-23', closed: true })
    expect(d[1].closed).toBe(false)
  })
  it('資料庫錯誤碼轉中文', () => {
    expect(bookingErrorText({ message: 'SLOT_TAKEN' })).toContain('被預約走')
    expect(bookingErrorText({ message: 'BOOKING_SUSPENDED' })).toContain('3 次')
    expect(bookingErrorText({ message: 'weird' })).toBe('操作失敗，請稍後再試')
  })
})

describe('體驗課', () => {
  it('usedTrials 只算體驗課且排除取消', () => {
    const rows = [
      { service_id: 't1', status: 'completed', service: { is_trial: true } },
      { service_id: 't2', status: 'cancelled', service: { is_trial: true } },
      { service_id: 'r1', status: 'booked', service: { is_trial: false } },
    ]
    expect([...usedTrials(rows)]).toEqual(['t1'])
  })
  it('錯誤訊息', () => {
    expect(bookingErrorText(new Error('NEED_ACCESS'))).toContain('體驗課程')
    expect(bookingErrorText(new Error('TRIAL_USED'))).toContain('限 1 次')
  })
})
