// 會員線上直播（YouTube 不公開影片）。規則見 supabase/migrations/0016_live_streams.sql
import { DEMO, DEMO_ROLE } from '../config'
import { supabase } from './supabase'
import { demoGet, demoList, demoSet } from './api'

const MIN = 60000
export const OPEN_BEFORE_MIN = 15
export const AUTO_END_HOURS = 6
export const PHASE_LABELS = { upcoming: '即將開始', live: '直播中', replay: '回放', closed: '已結束', cancelled: '已取消' }

/** YouTube 網址（含 Studio 網址）或 11 碼影片 ID → 影片 ID；認不得回傳 null */
export function youtubeId(raw) {
  const s = (raw ?? '').trim()
  const ok = (id) => (/^[A-Za-z0-9_-]{11}$/.test(id ?? '') ? id : null)
  if (ok(s)) return s
  let u
  try { u = new URL(s) } catch { return null }
  const host = u.hostname.replace(/^(www|m)\./, '')
  if (host === 'youtu.be') return ok(u.pathname.slice(1).split('/')[0])
  if (host === 'studio.youtube.com') return ok(u.pathname.match(/^\/video\/([^/]+)/)?.[1])
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null
  if (u.pathname === '/watch') return ok(u.searchParams.get('v'))
  return ok(u.pathname.match(/^\/(?:live|embed|shorts)\/([^/]+)/)?.[1])
}

export const liveEmbedUrl = (id) => `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0`

/** 直播狀態（與資料庫 _live_phase 相同規則） */
export function livePhase(s, now = new Date()) {
  if (s.cancelled) return 'cancelled'
  const t = now.getTime(), start = new Date(s.starts_at).getTime()
  const end = s.ended_at ? new Date(s.ended_at).getTime() : start + AUTO_END_HOURS * 60 * MIN
  if (t < end) return t < start - OPEN_BEFORE_MIN * MIN ? 'upcoming' : 'live'
  return t < end + s.replay_days * 1440 * MIN ? 'replay' : 'closed'
}

const ERRORS = {
  NOT_MEMBER: '這場直播僅限課程會員觀看',
  NOT_OPEN: `直播還沒開放，開始前 ${OPEN_BEFORE_MIN} 分鐘可以進入`,
  NOT_READY: '直播準備中，請稍後再試',
  NOT_FOUND: '找不到這場直播',
}
export function liveErrorText(err) {
  const msg = String(err?.message ?? err ?? '')
  const code = Object.keys(ERRORS).find((k) => msg.includes(k))
  return code ? ERRORS[code] : '載入失敗，請稍後再試'
}

const unwrap = ({ data, error }) => { if (error) throw error; return data }
const demoMember = () => DEMO_ROLE === 'admin' || !!demoGet('booking-access:demo-user')

export async function listLive() {
  if (DEMO) {
    return demoList('live').map((s) => ({ id: s.id, title: s.title, description: s.description, starts_at: s.starts_at, phase: livePhase(s), can_watch: demoMember() }))
      .filter((s) => ['upcoming', 'live', 'replay'].includes(s.phase)).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  }
  return unwrap(await supabase.rpc('list_live_streams'))
}

export async function getLiveVideo(id) {
  if (DEMO) {
    if (!demoMember()) throw new Error('NOT_MEMBER')
    const s = demoList('live').find((x) => x.id === id)
    if (!s) throw new Error('NOT_FOUND')
    if (!['live', 'replay'].includes(livePhase(s))) throw new Error('NOT_OPEN')
    if (!s.video_id) throw new Error('NOT_READY')
    return s.video_id
  }
  return unwrap(await supabase.rpc('get_live_video', { p_id: id }))
}

// ── 管理員 ──────────────────────────────────────────────────────────────────

export async function adminListLive() {
  if (DEMO) return [...demoList('live')].sort((a, b) => b.starts_at.localeCompare(a.starts_at))
  return unwrap(await supabase.from('live_streams')
    .select('id, title, description, starts_at, video_id, replay_days, ended_at, cancelled').order('starts_at', { ascending: false }).limit(100))
}

/** 新增（沒有 id）或修改 */
export async function adminSaveLive(id, row) {
  if (DEMO) {
    return demoSet('live', id
      ? demoList('live').map((s) => (s.id === id ? { ...s, ...row } : s))
      : [...demoList('live'), { id: crypto.randomUUID(), ended_at: null, cancelled: false, ...row }])
  }
  unwrap(id ? await supabase.from('live_streams').update(row).eq('id', id) : await supabase.from('live_streams').insert(row))
}
