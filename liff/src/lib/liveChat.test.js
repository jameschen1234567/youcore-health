import { describe, expect, it } from 'vitest'
import { chatErrorText, mergeComments } from './liveChat'

const c = (id, x = {}) => ({ id, body: `b${id}`, ...x })
describe('mergeComments', () => {
  it('新增、更新、移除並依 id 排序', () => {
    const r = mergeComments([c(1), c(2)], [c(3), c(2, { answered: true }), { id: 1, hidden: true }])
    expect(r.map((x) => x.id)).toEqual([2, 3])
    expect(r[0].answered).toBe(true)
  })
  it('重複抓到同一則不會變兩則', () => expect(mergeComments([c(1)], [c(1), c(1)])).toHaveLength(1))
  it('超過上限只留最新，置頂保留', () => {
    expect(mergeComments([], [c(1, { pinned: true }), c(2), c(3), c(4)], 2).map((x) => x.id)).toEqual([1, 3, 4])
  })
})
it('錯誤訊息', () => expect(chatErrorText(new Error('TOO_FAST'))).toContain('5 秒'))
