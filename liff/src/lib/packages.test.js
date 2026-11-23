import { describe, expect, it } from 'vitest'
import { daysLeft, importedUsed, packageAlerts, packageStats, pickPackage } from './packages'

const pkg = (id, fields) => ({ id, profile_id: 'u', service_id: 's', total: 10, expires_on: null, created_at: '2026-11-01T00:00:00Z', usages: [], ...fields })

describe('packageStats', () => {
  it('扣堂與補堂相抵', () => {
    const st = packageStats(pkg('a', { usages: [{ amount: 1 }, { amount: 1 }, { amount: -1 }] }), '2026-11-24')
    expect(st).toMatchObject({ used: 1, remaining: 9, status: 'active' })
  })
  it('到期日隔天才算到期', () => {
    expect(packageStats(pkg('a', { expires_on: '2026-11-24' }), '2026-11-24').status).toBe('active')
    expect(packageStats(pkg('a', { expires_on: '2026-11-24' }), '2026-11-25').status).toBe('expired')
  })
  it('用完', () => expect(packageStats(pkg('a', { total: 1, usages: [{ amount: 1 }] }), '2026-11-24').status).toBe('used_up'))
})

describe('pickPackage', () => {
  it('同服務、未到期、有剩，最早到期優先，不限期排最後', () => {
    const list = [
      pkg('forever'),
      pkg('late', { expires_on: '2027-03-01' }),
      pkg('early', { expires_on: '2026-12-31' }),
      pkg('other', { service_id: 'x', expires_on: '2026-11-30' }),
      pkg('expired', { expires_on: '2026-11-01' }),
      pkg('empty', { expires_on: '2026-12-01', total: 1, usages: [{ amount: 1 }] }),
    ]
    expect(pickPackage(list, 'u', 's', '2026-11-24').id).toBe('early')
    expect(pickPackage(list, 'u', 'x', '2026-12-05')).toBeNull()
  })
  it('以上課日判斷是否過期', () => {
    expect(pickPackage([pkg('a', { expires_on: '2026-11-20' })], 'u', 's', '2026-11-19').id).toBe('a')
  })
})

it('daysLeft', () => {
  expect(daysLeft('2026-12-01', '2026-11-24')).toBe(7)
  expect(daysLeft(null)).toBeNull()
})

describe('總覽與導入', () => {
  it('importedUsed', () => {
    expect(importedUsed(20, '')).toBe(0)
    expect(importedUsed(20, 12)).toBe(8)
    expect(importedUsed(20, '20')).toBe(0)
    expect(() => importedUsed(20, 21)).toThrow()
    expect(() => importedUsed(20, -1)).toThrow()
  })
  it('packageAlerts', () => {
    const list = [
      pkg('soon', { expires_on: '2026-12-01' }),
      pkg('low', { total: 10, usages: [{ amount: 8 }] }),
      pkg('expiredLeft', { expires_on: '2026-11-01' }),
      pkg('fine', { expires_on: '2027-06-01' }),
      pkg('expiredEmpty', { expires_on: '2026-11-01', total: 1, usages: [{ amount: 1 }] }),
    ]
    const a = packageAlerts(list, '2026-11-24')
    expect(a.map((x) => x.id)).toEqual(['soon', 'low', 'expiredLeft'])
    expect(a[0].reasons[0]).toBe('7 天後到期')
    expect(a[1].reasons[0]).toBe('剩 2 堂')
  })
})
