import { describe, expect, it } from 'vitest'
import { addDays, canCheck, daySpan, homeworkStatus, maskName, milestones, reachedMilestone, validateHomework } from './homework'

const h = { starts_on: '2026-11-20', ends_on: '2026-12-03', target_days: 10, points: 10, archived: false, completed_at: null }

describe('里程碑', () => {
  it('第一次、過半、達成', () => {
    expect(milestones(10).map((m) => [m.key, m.at])).toEqual([['first', 1], ['half', 5], ['done', 10]])
    expect(milestones(1).map((m) => m.key)).toEqual(['done'])
    expect(milestones(2).map((m) => [m.key, m.at])).toEqual([['first', 1], ['done', 2]])
    expect(milestones(3).map((m) => [m.key, m.at])).toEqual([['first', 1], ['half', 2], ['done', 3]])
  })
  it('跨過才觸發', () => {
    expect(reachedMilestone(10, 0, 1).key).toBe('first')
    expect(reachedMilestone(10, 4, 5).key).toBe('half')
    expect(reachedMilestone(10, 5, 6)).toBeNull()
    expect(reachedMilestone(10, 9, 10).key).toBe('done')
  })
})

describe('狀態與打勾', () => {
  it('依日期與完成度', () => {
    expect(homeworkStatus(h, 3, '2026-11-25')).toBe('active')
    expect(homeworkStatus(h, 3, '2026-11-19')).toBe('upcoming')
    expect(homeworkStatus(h, 3, '2026-12-04')).toBe('expired')
    expect(homeworkStatus(h, 10, '2026-11-25')).toBe('done')
    expect(homeworkStatus({ ...h, archived: true }, 3, '2026-11-25')).toBe('archived')
  })
  it('只能勾今天或昨天、且在期間內', () => {
    expect(canCheck(h, '2026-11-25', '2026-11-25')).toBe(true)
    expect(canCheck(h, '2026-11-24', '2026-11-25')).toBe(true)
    expect(canCheck(h, '2026-11-23', '2026-11-25')).toBe(false)
    expect(canCheck(h, '2026-11-20', '2026-11-20')).toBe(true)
    expect(canCheck(h, '2026-11-19', '2026-11-20')).toBe(false) // 昨天在期間外
  })
  it('日期工具', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(daySpan('2026-11-20', '2026-12-03')).toBe(14)
  })
})

describe('驗證與遮名', () => {
  it('作業欄位', () => {
    expect(validateHomework({ ...h, title: '抓地站' })).toBeNull()
    expect(validateHomework({ ...h, title: '' })).toMatch('名稱')
    expect(validateHomework({ ...h, title: 'x', target_days: 15 })).toMatch('14 天')
    expect(validateHomework({ ...h, title: 'x', ends_on: '2026-11-01' })).toMatch('結束日')
    expect(validateHomework({ ...h, title: 'x', link: 'ftp://a' })).toMatch('連結')
  })
  it('名字遮一半', () => {
    expect(maskName('陳柏穎')).toBe('陳*穎')
    expect(maskName('王明')).toBe('王*')
    expect(maskName('Nicole')).toBe('N****e')
    expect(maskName('')).toBe('會*') // 沒名字用「會員」
  })
})
