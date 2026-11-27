// 回家作業、打勾、里程碑、點數與排行榜。規則見 supabase/migrations/0032_homework_points.sql
// 會員限定：profiles.member_no 有值。資料庫也把關（打勾要 is_member）。
import { DEMO } from '../config'
import { supabase } from './supabase'
import { demoGet, demoList, demoSet } from './api'

const unwrap = ({ data, error }) => { if (error) throw error; return data }
export const todayTaipei = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())
export const addDays = (d, n) => {
  const t = new Date(`${d}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
export const daySpan = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5) + 1
const uid = () => crypto.randomUUID()

// ── 純函式（方便測試） ──────────────────────────────────────────────────────

/** 里程碑：第一次、過半、達成 */
export function milestones(target) {
  const half = Math.ceil(target / 2)
  const list = []
  if (target > 1) list.push({ at: 1, key: 'first', title: '踏出第一步！', text: '第一次打勾完成，好的開始是成功的一半。' })
  if (half > 1 && half < target) list.push({ at: half, key: 'half', title: '過半了！', text: '已經完成一半，繼續保持這個節奏。' })
  list.push({ at: target, key: 'done', title: '達成目標！', text: '回家作業全部完成，你真的做到了！' })
  return list
}

/** 打勾後剛好跨過的里程碑（打勾數從 before 變成 after） */
export function reachedMilestone(target, before, after) {
  return milestones(target).find((m) => before < m.at && after >= m.at) ?? null
}

/** 作業狀態 */
export function homeworkStatus(h, count, today = todayTaipei()) {
  if (h.completed_at || count >= h.target_days) return 'done'
  if (h.archived) return 'archived'
  if (today < h.starts_on) return 'upcoming'
  if (today > h.ends_on) return 'expired'
  return 'active'
}
export const STATUS_LABEL = { active: '進行中', upcoming: '尚未開始', expired: '已結束', done: '已達成', archived: '已封存' }

/** 今天能不能勾、昨天能不能補勾 */
export function canCheck(h, day, today = todayTaipei()) {
  return !h.archived && day >= h.starts_on && day <= h.ends_on && (day === today || day === addDays(today, -1))
}

export function maskName(nm) {
  const s = [...(nm || '會員')]
  if (s.length <= 1) return s.join('')
  if (s.length === 2) return `${s[0]}*`
  return s[0] + '*'.repeat(s.length - 2) + s.at(-1)
}

export function validateHomework(v) {
  if (!v.title?.trim()) return '請填作業名稱'
  if (v.title.trim().length > 60) return '名稱最多 60 字'
  if (!v.starts_on || !v.ends_on) return '請填開始與結束日期'
  if (v.ends_on < v.starts_on) return '結束日不能早於開始日'
  const span = daySpan(v.starts_on, v.ends_on)
  if (span > 366) return '期間最長一年'
  const t = Number(v.target_days)
  if (!Number.isInteger(t) || t < 1) return '目標天數至少 1 天'
  if (t > span) return `目標天數不能超過期間天數（${span} 天）`
  const p = Number(v.points)
  if (!Number.isInteger(p) || p < 0 || p > 1000) return '點數請填 0～1000 的整數'
  if (v.link && !/^https?:\/\//.test(v.link.trim())) return '連結要以 http:// 或 https:// 開頭'
  return null
}

// ── 會員 ────────────────────────────────────────────────────────────────

export function isMember(profile) {
  if (DEMO) return !!demoGet(`member_no:${profile.id}`)
  return !!profile?.member_no
}

// ── 作業與打勾 ──────────────────────────────────────────────────────────────

const HW_FIELDS = 'id, profile_id, title, detail, link, starts_on, ends_on, target_days, points, archived, completed_at, created_at'

/** 某客戶的作業（含打勾日期陣列 days），新的在前 */
export async function listHomework(profileId) {
  if (DEMO) {
    const checks = demoList(`hw-checks:${profileId}`)
    return demoList(`hw:${profileId}`).map((h) => ({ ...h, days: checks.filter((c) => c.homework_id === h.id).map((c) => c.checked_on).sort() }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  const [hw, checks] = await Promise.all([
    supabase.from('homework').select(HW_FIELDS).eq('profile_id', profileId).order('created_at', { ascending: false }),
    supabase.from('homework_checkins').select('homework_id, checked_on').eq('profile_id', profileId),
  ])
  const rows = unwrap(hw)
  const cs = unwrap(checks)
  return rows.map((h) => ({ ...h, days: cs.filter((c) => c.homework_id === h.id).map((c) => c.checked_on).sort() }))
}

export async function checkIn(profileId, h, day) {
  if (DEMO) {
    const key = `hw-checks:${profileId}`
    const checks = demoList(key)
    if (checks.some((c) => c.homework_id === h.id && c.checked_on === day)) return
    demoSet(key, [...checks, { homework_id: h.id, checked_on: day }])
    // 模擬資料庫觸發器：達成就發點
    const n = checks.filter((c) => c.homework_id === h.id).length + 1
    const list = demoList(`hw:${profileId}`)
    const cur = list.find((x) => x.id === h.id)
    if (cur && !cur.completed_at && n >= cur.target_days) {
      demoSet(`hw:${profileId}`, list.map((x) => (x.id === h.id ? { ...x, completed_at: new Date().toISOString() } : x)))
      if (cur.points > 0) demoAddPoints(profileId, cur.points, `完成回家作業：${cur.title}`, cur.id)
    }
    return
  }
  const { error } = await supabase.from('homework_checkins').insert({ homework_id: h.id, profile_id: profileId, checked_on: day })
  if (error && error.code !== '23505') throw error
}

export async function uncheck(profileId, h, day) {
  if (DEMO) {
    const key = `hw-checks:${profileId}`
    demoSet(key, demoList(key).filter((c) => !(c.homework_id === h.id && c.checked_on === day)))
    return
  }
  const { error } = await supabase.from('homework_checkins').delete().eq('homework_id', h.id).eq('checked_on', day)
  if (error) throw error
}

// ── 管理員：作業 ────────────────────────────────────────────────────────────

const cleanHw = (v) => ({
  title: v.title.trim(),
  detail: v.detail?.trim() || null,
  link: v.link?.trim() || null,
  starts_on: v.starts_on,
  ends_on: v.ends_on,
  target_days: Number(v.target_days),
  points: Number(v.points),
})

export async function adminSaveHomework(profileId, v) {
  const row = cleanHw(v)
  if (DEMO) {
    const list = demoList(`hw:${profileId}`)
    demoSet(`hw:${profileId}`, v.id
      ? list.map((x) => (x.id === v.id ? { ...x, ...row } : x))
      : [...list, { id: uid(), profile_id: profileId, ...row, archived: false, completed_at: null, created_at: new Date().toISOString() }])
    return
  }
  const q = v.id
    ? supabase.from('homework').update(row).eq('id', v.id)
    : supabase.from('homework').insert({ profile_id: profileId, ...row })
  unwrap(await q)
}

export async function adminArchiveHomework(profileId, id, archived) {
  if (DEMO) return demoSet(`hw:${profileId}`, demoList(`hw:${profileId}`).map((x) => (x.id === id ? { ...x, archived } : x)))
  unwrap(await supabase.from('homework').update({ archived }).eq('id', id))
}

export async function adminDeleteHomework(profileId, id) {
  if (DEMO) {
    demoSet(`hw:${profileId}`, demoList(`hw:${profileId}`).filter((x) => x.id !== id))
    demoSet(`hw-checks:${profileId}`, demoList(`hw-checks:${profileId}`).filter((c) => c.homework_id !== id))
    return
  }
  unwrap(await supabase.from('homework').delete().eq('id', id))
}

// ── 點數 ────────────────────────────────────────────────────────────────

function demoAddPoints(profileId, amount, reason, homework_id = null) {
  const key = `points:${profileId}`
  demoSet(key, [...demoList(key), { id: uid(), profile_id: profileId, amount, reason, homework_id, created_at: new Date().toISOString() }])
}

/** 點數紀錄，新的在前 */
export async function listPoints(profileId) {
  if (DEMO) return demoList(`points:${profileId}`).sort((a, b) => b.created_at.localeCompare(a.created_at))
  return unwrap(await supabase.from('points_ledger').select('id, amount, reason, homework_id, created_at')
    .eq('profile_id', profileId).order('created_at', { ascending: false }))
}

export const pointsBalance = (rows) => (rows ?? []).reduce((n, r) => n + r.amount, 0)

/** 管理員手動加減點（負數＝兌換扣點） */
export async function adminAdjustPoints(profileId, amount, reason) {
  const n = Number(amount)
  if (!Number.isInteger(n) || n === 0 || Math.abs(n) > 10000) throw new Error('BAD_AMOUNT')
  if (!reason?.trim()) throw new Error('NO_REASON')
  if (DEMO) return demoAddPoints(profileId, n, reason.trim())
  unwrap(await supabase.from('points_ledger').insert({ profile_id: profileId, amount: n, reason: reason.trim() }))
}

/** 排行榜：period = 'month' | 'all' */
export async function leaderboard(period, me) {
  if (DEMO) {
    const rows = demoList(`points:${me.id}`).filter((r) => r.amount > 0 && (period === 'all' || r.created_at.slice(0, 7) === todayTaipei().slice(0, 7)))
    const pts = rows.reduce((n, r) => n + r.amount, 0)
    return pts > 0 ? [{ rank: 1, name: maskName(me.display_name), points: pts, is_me: true }] : []
  }
  return unwrap(await supabase.rpc('points_leaderboard', { p_period: period }))
}
