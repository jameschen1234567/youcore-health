import { describe, expect, it } from 'vitest'
import { nextStatus, sortOrders, statusLabel, statusTimes } from './orders'
import { allFootCsvFilename, footCsv, footCsvFilename, taipeiDate } from './csv'

describe('訂單狀態', () => {
  it('依序前進，最後一個沒有下一步', () => {
    expect(nextStatus('assessed')).toBe('designing')
    expect(nextStatus('ready')).toBe('picked_up')
    expect(nextStatus('picked_up')).toBeNull()
    expect(nextStatus('???')).toBeNull()
  })

  it('狀態中文', () => {
    expect(statusLabel('ready')).toBe('可取件')
    expect(statusLabel('x')).toBe('x')
  })

  it('每個狀態取第一次到達時間', () => {
    const t = statusTimes([
      { status: 'designing', created_at: '2026-11-03T00:00:00Z' },
      { status: 'assessed', created_at: '2026-11-01T00:00:00Z' },
      { status: 'designing', created_at: '2026-11-05T00:00:00Z' },
    ])
    expect(t).toEqual({ assessed: '2026-11-01T00:00:00Z', designing: '2026-11-03T00:00:00Z' })
  })

  it('未取件排前面', () => {
    const s = sortOrders([
      { id: 1, status: 'picked_up', created_at: '2026-11-10' },
      { id: 2, status: 'designing', created_at: '2026-11-01' },
      { id: 3, status: 'ready', created_at: '2026-11-05' },
    ])
    expect(s.map((o) => o.id)).toEqual([3, 2, 1])
  })
})

describe('足部 CSV 匯出', () => {
  const row = { client_name: '王小明', side: 'left', length_mm: 248.5, width_mm: '95', created_at: '2026-11-20T17:30:00Z', algo_version: 'a1-0.1.0' }

  it('日期以台北時間計算（UTC 17:30 已是隔天）', () => {
    expect(taipeiDate('2026-11-20T17:30:00Z')).toBe('2026-11-21')
  })

  it('欄位與格式', () => {
    const csv = footCsv([row])
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).trim().split('\r\n')
    expect(lines[0]).toBe('客戶名,腳別,足長_mm,足寬_mm,量測日期,algo_version,腳跟寬_mm,來源')
    expect(lines[1]).toBe('王小明,左,248.5,95.0,2026-11-21,a1-0.1.0,,')
  })

  it('名字有逗號或引號要跳脫', () => {
    const csv = footCsv([{ ...row, client_name: 'A,"B"' }])
    expect(csv).toContain('"A,""B""",左')
  })

  it('檔名：客戶名_腳別_量測日期，去掉不合法字元', () => {
    expect(footCsvFilename(row)).toBe('王小明_左_20261121.csv')
    expect(footCsvFilename({ ...row, client_name: 'a/b c', side: 'right' })).toBe('abc_右_20261121.csv')
    expect(footCsvFilename({ ...row, client_name: '' })).toBe('未命名_左_20261121.csv')
  })

  it('全部匯出檔名', () => {
    expect(allFootCsvFilename(new Date('2026-11-21T02:00:00Z'))).toBe('足部量測_全部_20261121.csv')
  })
})
