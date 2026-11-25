import { describe, expect, it } from 'vitest'
import { MAX_LEN, TOPICS, arrange, feedbackError, feedbackErrorText, topicLabel } from './feedback'

describe('意見回饋', () => {
  it('輸入檢查', () => {
    expect(feedbackError('', '內容')).toContain('類別')
    expect(feedbackError('booking', '   ')).toContain('內容')
    expect(feedbackError('booking', '字'.repeat(MAX_LEN + 1))).toContain('1000')
    expect(feedbackError('booking', '字'.repeat(MAX_LEN))).toBe('')
  })
  it('類別名稱', () => {
    expect(new Set(TOPICS.map(([k]) => k)).size).toBe(TOPICS.length)
    expect(topicLabel('foot')).toBe('足型自評')
    expect(topicLabel('xx')).toBe('其他')
  })
  it('未讀在前，再依更新時間；訊息舊到新', () => {
    const rows = [
      { id: 1, u: false, updated_at: '3', messages: [{ created_at: 'b' }, { created_at: 'a' }] },
      { id: 2, u: true, updated_at: '1' },
      { id: 3, u: false, updated_at: '5' },
    ]
    const r = arrange(rows, 'u')
    expect(r.map((x) => x.id)).toEqual([2, 3, 1])
    expect(r[2].messages.map((m) => m.created_at)).toEqual(['a', 'b'])
  })
  it('錯誤訊息', () => {
    expect(feedbackErrorText(new Error('TOO_MANY'))).toContain('10 則')
    expect(feedbackErrorText(new Error('CLOSED'))).toContain('結案')
    expect(feedbackErrorText(new Error('x'))).toContain('失敗')
  })
})
