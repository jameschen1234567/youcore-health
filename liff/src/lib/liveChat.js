// 直播留言（輪詢）。規則見 supabase/migrations/0017_live_chat.sql
import { DEMO, DEMO_ROLE } from '../config'
import { supabase } from './supabase'
import { demoGet, demoList, demoSet } from './api'
import { livePhase } from './live'

export const POLL_MS = 4000
export const MAX_BODY = 200

/** 把新抓到的留言併進現有清單：同 id 取新的、hidden 移除，依 id 排序，最多留 max 則（置頂保留） */
export function mergeComments(current, incoming, max = 300) {
  const map = new Map(current.map((c) => [c.id, c]))
  for (const c of incoming) { if (c.hidden) map.delete(c.id); else map.set(c.id, c) }
  const all = [...map.values()].sort((a, b) => a.id - b.id)
  return all.filter((c, i) => c.pinned || i >= all.length - max)
}

const ERRORS = {
  TOO_FAST: '送太快了，請等 5 秒再留言',
  MUTED: '你目前無法留言，需要協助請傳 LINE 給我們',
  CHAT_CLOSED: '直播已結束，留言已關閉',
  BAD_COMMENT: `請輸入 1–${MAX_BODY} 字`,
  NOT_MEMBER: '留言僅限課程會員',
  PRIVATE_COMMENT: '私下提問不能置頂公開',
}
export function chatErrorText(err) {
  const msg = String(err?.message ?? err ?? '')
  const code = Object.keys(ERRORS).find((k) => msg.includes(k))
  return code ? ERRORS[code] : '送出失敗，請再試一次'
}

const unwrap = ({ data, error }) => { if (error) throw error; return data }
const me = () => (DEMO_ROLE === 'admin' ? 'demo-admin' : 'demo-user')

export async function getFeed(streamId, since = null) {
  if (DEMO) {
    const s = demoList('live').find((x) => x.id === streamId)
    const admin = DEMO_ROLE === 'admin'
    return {
      phase: s ? livePhase(s) : 'closed', now: new Date().toISOString(), likes: demoGet(`live-likes:${streamId}`) ?? 0, muted: demoList('live-mutes').includes(me()),
      comments: demoList('live-comments').filter((c) => c.stream_id === streamId && (admin || !c.private || c.author === me()))
        .map((c) => (c.hidden ? { id: c.id, hidden: true } : { ...c, mine: c.author === me(), muted: demoList('live-mutes').includes(c.author) })),
    }
  }
  return unwrap(await supabase.rpc('get_live_feed', { p_id: streamId, p_since: since }))
}

export async function postComment(streamId, body, isPrivate) {
  if (DEMO) {
    if (demoList('live-mutes').includes(me())) throw new Error('MUTED')
    const admin = DEMO_ROLE === 'admin'
    const mine = demoList('live-comments').filter((c) => c.author === me())
    if (!admin && mine.length && Date.now() - new Date(mine.at(-1).created_at) < 5000) throw new Error('TOO_FAST')
    return demoSet('live-comments', [...demoList('live-comments'), {
      id: Date.now(), stream_id: streamId, author: me(), name: admin ? 'James' : '體驗用戶', is_host: admin, body: body.trim(),
      private: isPrivate && !admin, pinned: false, answered: false, hidden: false, created_at: new Date().toISOString(),
    }])
  }
  return unwrap(await supabase.rpc('post_live_comment', { p_id: streamId, p_body: body, p_private: isPrivate }))
}

export async function sendLikes(streamId, n) {
  if (DEMO) return demoSet(`live-likes:${streamId}`, (demoGet(`live-likes:${streamId}`) ?? 0) + n)
  return unwrap(await supabase.rpc('like_live', { p_id: streamId, p_n: n }))
}

/** action: pin | unpin | answer | unanswer | hide | mute | unmute */
export async function moderate(commentId, action) {
  if (DEMO) {
    const target = demoList('live-comments').find((c) => c.id === commentId)
    if (action === 'mute') return demoSet('live-mutes', [...new Set([...demoList('live-mutes'), target.author])])
    if (action === 'unmute') return demoSet('live-mutes', demoList('live-mutes').filter((x) => x !== target.author))
    return demoSet('live-comments', demoList('live-comments').map((c) => {
      if (action === 'pin') return { ...c, pinned: c.id === commentId }
      if (c.id !== commentId) return c
      return { unpin: { ...c, pinned: false }, answer: { ...c, answered: true }, unanswer: { ...c, answered: false }, hide: { ...c, hidden: true, pinned: false } }[action]
    }))
  }
  return unwrap(await supabase.rpc('moderate_live', { p_comment: commentId, p_action: action }))
}
