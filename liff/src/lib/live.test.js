import { describe, expect, it } from 'vitest'
import { livePhase, liveErrorText, youtubeId } from './live'

const ID = 'abc-DEF_123'
describe('youtubeId', () => {
  it('各種網址', () => {
    for (const u of [ID, ` ${ID} `, `https://youtu.be/${ID}?si=x`, `https://www.youtube.com/watch?v=${ID}&t=1`, `https://youtube.com/live/${ID}?feature=share`,
      `https://studio.youtube.com/video/${ID}/livestreaming`, `https://m.youtube.com/watch?v=${ID}`]) expect(youtubeId(u)).toBe(ID)
  })
  it('認不得', () => {
    for (const u of ['', null, 'https://vimeo.com/123', 'https://www.youtube.com/@youcore', 'https://www.youtube.com/watch?v=short']) expect(youtubeId(u)).toBeNull()
  })
})

describe('livePhase', () => {
  const s = { starts_at: '2026-12-01T12:00:00Z', replay_days: 30, ended_at: null, cancelled: false }
  const at = (t, x = {}) => livePhase({ ...s, ...x }, new Date(t))
  it('開始前 15 分鐘開放', () => {
    expect(at('2026-12-01T11:44:00Z')).toBe('upcoming')
    expect(at('2026-12-01T11:45:00Z')).toBe('live')
  })
  it('忘記結束，6 小時後轉回放', () => {
    expect(at('2026-12-01T17:59:00Z')).toBe('live')
    expect(at('2026-12-01T18:00:00Z')).toBe('replay')
  })
  it('結束後依天數回放', () => {
    const ended_at = '2026-12-01T13:00:00Z'
    expect(at('2026-12-01T13:00:00Z', { ended_at })).toBe('replay')
    expect(at('2026-12-31T13:00:00Z', { ended_at })).toBe('closed')
    expect(at('2026-12-01T13:00:00Z', { ended_at, replay_days: 0 })).toBe('closed')
  })
  it('取消', () => expect(at('2026-12-01T12:00:00Z', { cancelled: true })).toBe('cancelled'))
})

it('錯誤訊息', () => expect(liveErrorText(new Error('NOT_MEMBER'))).toContain('登入'))
