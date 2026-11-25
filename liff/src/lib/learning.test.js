import { describe, expect, it } from 'vitest'
import { endDate, learningStatus, nextStart } from './learning'

const g = (starts_on, expires_on, revoked_at = null) => ({ starts_on, expires_on, revoked_at })
describe('以月計算效期', () => {
  it('3、6、12 個月，含當天', () => {
    expect(endDate('2026-11-26', 3)).toBe('2027-02-25')
    expect(endDate('2026-11-26', 6)).toBe('2027-05-25')
    expect(endDate('2026-11-26', 12)).toBe('2027-11-25')
  })
  it('月底', () => {
    expect(endDate('2027-01-31', 1)).toBe('2027-02-27')
    expect(endDate('2026-12-01', 3)).toBe('2027-02-28')
    expect(endDate('2027-11-30', 3)).toBe('2028-02-28')
  })
  it('狀態：到期日當天仍有效、隔天失效、停用失效、尚未開始', () => {
    expect(learningStatus([g('2026-11-01', '2026-11-30')], '2026-11-30').active).toBe(true)
    expect(learningStatus([g('2026-11-01', '2026-11-30')], '2026-12-01').active).toBe(false)
    expect(learningStatus([g('2026-11-01', '2026-11-30', 'x')], '2026-11-10').active).toBe(false)
    expect(learningStatus([g('2026-12-01', '2026-12-31')], '2026-11-10')).toMatchObject({ active: false, startsLater: '2026-12-01' })
  })
  it('續約接在後面，過期則從今天', () => {
    expect(nextStart([g('2026-11-01', '2026-11-30')], '2026-11-10')).toBe('2026-12-01')
    expect(nextStart([g('2026-01-01', '2026-01-31')], '2026-11-10')).toBe('2026-11-10')
    expect(nextStart([], '2026-11-10')).toBe('2026-11-10')
  })
})
