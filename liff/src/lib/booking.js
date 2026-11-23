// 線上預約：規則常數、時段計算（純函式）與資料存取。
// 真正的規則由資料庫 RPC 把關（migration 0008），畫面只是提前告訴客戶哪些能選。
import { DEMO, LINE_OA_ID } from '../config'
import { supabase } from './supabase'
import { demoGet, demoList, demoSet } from './api'

export const OPEN = '10:00'
export const CLOSE = '20:30'
export const STEP_MIN = 30
export const LEAD_HOURS = 3
export const CHANGE_HOURS = 24
export const MAX_DAYS = 30
export const MAX_ACTIVE = 4
export const NO_SHOW_LIMIT = 3

const H = 3600 * 1000
const WD = ['日', '一', '二', '三', '四', '五', '六']

// ── 時間工具（台北時間，台灣沒有日光節約） ───────────────────────────────────

/** 台北日期 + 時間 → Date */
export const taipei = (date, time) => new Date(`${date}T${time}:00+08:00`)
/** Date → 台北日期 YYYY-MM-DD */
export const taipeiDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d)
/** Date → 台北時間 HH:mm */
export const taipeiTime = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
/** YYYY-MM-DD 的星期（0 = 日） */
export const weekday = (date) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay() }
export const isClosedDay = (date) => weekday(date) === 1
/** 11/25（三）14:00 */
export function fmtSlot(iso) {
  const d = new Date(iso)
  const [, m, day] = taipeiDate(d).split('-')
  return `${Number(m)}/${Number(day)}（${WD[weekday(taipeiDate(d))]}）${taipeiTime(d)}`
}
export const fmtDateLabel = (date) => { const [, m, d] = date.split('-'); return { md: `${Number(m)}/${Number(d)}`, wd: WD[weekday(date)] } }
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`

/** 今天起 MAX_DAYS 天的日期清單 */
export function bookingDates(now = new Date(), days = MAX_DAYS) {
  const start = taipei(taipeiDate(now), '12:00')
  return Array.from({ length: days + 1 }, (_, i) => {
    const date = taipeiDate(new Date(start.getTime() + i * 24 * H))
    return { date, closed: isClosedDay(date), ...fmtDateLabel(date) }
  })
}

/** 營業時間內所有開始時間（服務結束不晚於 CLOSE） */
export function startTimes(durationMin) {
  const out = []
  for (let t = toMin(OPEN); t + durationMin <= toMin(CLOSE); t += STEP_MIN) out.push(fromMin(t))
  return out
}

const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1

// ── 後台週曆 ────────────────────────────────────────────────────────────────

/** 日期加減天數（台北日期字串） */
export const addDays = (date, n) => taipeiDate(new Date(taipei(date, '12:00').getTime() + n * 24 * H))

/** 含 date 的那一週（週一到週日）的 7 個日期 */
export function weekOf(date) {
  const monday = addDays(date, -((weekday(date) + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** 某段時間在該日曆欄的位置（以營業開始起算的分鐘數，超出營業時間的部分截掉）；不在當天或完全在營業時間外回傳 null */
export function dayPosition(date, startsIso, endsIso) {
  const open = taipei(date, OPEN).getTime(), close = taipei(date, CLOSE).getTime()
  const s = Math.max(new Date(startsIso).getTime(), open)
  const e = Math.min(new Date(endsIso).getTime(), close)
  if (e <= s) return null
  return { top: (s - open) / 60000, height: (e - s) / 60000 }
}

/** 營業時間總分鐘數 */
export const DAY_MINUTES = toMin(CLOSE) - toMin(OPEN)

/**
 * 某天某服務的時段狀態。
 * busy: [{ starts_at, ends_at }]（ISO）；ignore: 改期時自己原本那筆 { starts_at, ends_at }
 * 回傳 [{ time, start: Date, state: 'free' | 'taken' | 'short' | 'past' }]
 *   taken：這個開始時間本身已有人預約／關閉；short：開始時間沒人用，但接下去的時間不夠完成這項服務
 */
export function buildSlots(date, service, busy, now = new Date(), ignore = null) {
  if (!service || isClosedDay(date)) return []
  const ranges = (busy ?? [])
    .filter((b) => !(ignore && b.starts_at === ignore.starts_at && b.ends_at === ignore.ends_at))
    .map((b) => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()])
  const block = (service.duration_min + (service.buffer_min ?? 0)) * 60000
  return startTimes(service.duration_min).map((time) => {
    const start = taipei(date, time)
    const s = start.getTime()
    let state = 'free'
    if (s < now.getTime() + LEAD_HOURS * H || s > now.getTime() + MAX_DAYS * 24 * H) state = 'past'
    else if (ranges.some(([b0, b1]) => s >= b0 && s < b1)) state = 'taken'
    else if (ranges.some(([b0, b1]) => overlaps(s, s + block, b0, b1))) state = 'short'
    return { time, start, state }
  })
}

/** 客戶能不能自己改期／取消 */
export const canClientChange = (b, now = new Date()) =>
  b.status === 'booked' && new Date(b.starts_at).getTime() - now.getTime() > CHANGE_HOURS * H

export const isUpcoming = (b, now = new Date()) => b.status === 'booked' && new Date(b.ends_at).getTime() > now.getTime()

export const STATUS_LABELS = { booked: '已預約', cancelled: '已取消', completed: '已完成', no_show: '未到' }

const ERRORS = {
  SLOT_TAKEN: '這個時段剛剛被預約走了，請選其他時間',
  TOO_SOON: `最晚要在開始前 ${LEAD_HOURS} 小時預約`,
  TOO_FAR: `只能預約 ${MAX_DAYS} 天內的時段`,
  CLOSED_DAY: '週一公休',
  OUTSIDE_HOURS: '不在營業時間內',
  BAD_START: '時段格式不正確',
  LOCKED_24H: `開始前 ${CHANGE_HOURS} 小時內無法線上修改，請傳訊息給我們`,
  BOOKING_SUSPENDED: `無故未到已達 ${NO_SHOW_LIMIT} 次，線上預約已暫停，請傳訊息給我們`,
  TOO_MANY: `同時最多保留 ${MAX_ACTIVE} 筆預約`,
  NOT_BOOKABLE: '這項服務目前請傳訊息預約',
  NOT_ACTIVE: '這筆預約已經不是有效狀態',
  NEED_ACCESS: '正式課程需購課後由我們開通，目前可以先預約體驗課程',
  TRIAL_USED: '這項體驗課程已經預約過了，每人限 1 次',
}
export function bookingErrorText(err) {
  const msg = String(err?.message ?? err ?? '')
  const code = Object.keys(ERRORS).find((k) => msg.includes(k))
  return code ? ERRORS[code] : '操作失敗，請稍後再試'
}

/** 傳 LINE 訊息給官方帳號（預填文字） */
export const lineMessageUrl = (text) =>
  LINE_OA_ID ? `https://line.me/R/oaMessage/${encodeURIComponent(LINE_OA_ID)}/?${encodeURIComponent(text)}` : null

// ── 資料存取 ────────────────────────────────────────────────────────────────

const TRIAL_NOTE = (n) => `${n} 分鐘體驗＋30 分鐘免費身體檢測`
const DEMO_SERVICES = [
  { id: 'svc-1', name: '科技結合運動按摩', duration_min: 60, buffer_min: 0, bookable: true, sort_order: 1, is_trial: false },
  { id: 'svc-2', name: '一對一肌力與體能課程', duration_min: 60, buffer_min: 0, bookable: true, sort_order: 2, is_trial: false },
  { id: 'svc-3', name: '運動傷害防護與康復訓練', duration_min: 90, buffer_min: 0, bookable: true, sort_order: 3, is_trial: false },
  { id: 'svc-4', name: '專業健康檢測', duration_min: 75, buffer_min: 0, bookable: false, sort_order: 4, is_trial: false },
  { id: 'svc-5', name: '頌缽療育', duration_min: 60, buffer_min: 0, bookable: false, sort_order: 5, is_trial: false },
  { id: 'svc-11', name: '肌力體驗課程', duration_min: 90, buffer_min: 0, bookable: true, sort_order: 11, is_trial: true, description: TRIAL_NOTE(60) },
  { id: 'svc-12', name: '按摩體驗課程', duration_min: 90, buffer_min: 0, bookable: true, sort_order: 12, is_trial: true, description: TRIAL_NOTE(60) },
  { id: 'svc-13', name: '科技修復體驗課程', duration_min: 90, buffer_min: 0, bookable: true, sort_order: 13, is_trial: true, description: TRIAL_NOTE(60) },
  { id: 'svc-14', name: '康復訓練體驗課程', duration_min: 120, buffer_min: 0, bookable: true, sort_order: 14, is_trial: true, description: TRIAL_NOTE(90) },
]
const demoServices = () => demoGet('services') ?? DEMO_SERVICES
const SVC = 'service:services(id, name, duration_min, buffer_min, is_trial)'
const BOOKING_FIELDS = `id, profile_id, service_id, starts_at, ends_at, block_until, status, cancelled_by, note, created_at, ${SVC}`

const unwrap = ({ data, error }) => { if (error) throw error; return data }

export async function listServices({ all = false } = {}) {
  if (DEMO) return demoServices().filter((s) => all || s.bookable)
  let q = supabase.from('services').select('id, name, duration_min, buffer_min, bookable, sort_order, is_trial, description').order('sort_order')
  if (!all) q = q.eq('bookable', true)
  return unwrap(await q)
}

export async function getBusy(fromIso, toIso) {
  if (DEMO) {
    const f = new Date(fromIso), t = new Date(toIso)
    return [
      ...demoList('bookings').filter((b) => b.status === 'booked').map((b) => ({ starts_at: b.starts_at, ends_at: b.block_until, kind: 'booked' })),
      ...demoList('blocked').map((b) => ({ starts_at: b.starts_at, ends_at: b.ends_at, kind: 'blocked' })),
    ].filter((b) => new Date(b.starts_at) < t && new Date(b.ends_at) > f)
  }
  return unwrap(await supabase.rpc('get_busy', { p_from: fromIso, p_to: toIso }))
}

export async function listMyBookings(profileId) {
  if (DEMO) return withService(demoList('bookings').filter((b) => b.profile_id === profileId)).sort(byStart)
  return unwrap(await supabase.from('bookings').select(BOOKING_FIELDS).eq('profile_id', profileId).order('starts_at'))
}

export async function getNoShowCount(profileId) {
  if (DEMO) {
    const reset = demoGet(`booking-reset:${profileId}`) ?? ''
    return demoList('bookings').filter((b) => b.profile_id === profileId && b.status === 'no_show' && b.starts_at > reset).length
  }
  return unwrap(await supabase.rpc('no_show_count', { p_profile: profileId }))
}

/** 是否已開通正式課程預約權限 */
export async function getBookingAccess(profileId) {
  if (DEMO) return !!demoGet(`booking-access:${profileId}`)
  const rows = unwrap(await supabase.from('booking_access').select('profile_id').eq('profile_id', profileId))
  return rows.length > 0
}

/** 已用過的體驗課（取消的不算）→ Set(service_id) */
export function usedTrials(bookings) {
  return new Set((bookings ?? []).filter((b) => b.service?.is_trial && b.status !== 'cancelled').map((b) => b.service_id))
}

/** 新增預約；profileId 只有管理員代客預約時才傳 */
export async function createBooking(serviceId, startsIso, note = '', profileId = null, { asAdmin = false } = {}) {
  if (DEMO) return demoCreate(serviceId, startsIso, note, profileId ?? 'demo-user', asAdmin)
  return unwrap(await supabase.rpc('create_booking', { p_service: serviceId, p_starts: startsIso, p_note: note || null, p_profile: profileId }))
}

export async function rescheduleBooking(id, startsIso, { asAdmin = false } = {}) {
  if (DEMO) return demoReschedule(id, startsIso, asAdmin)
  return unwrap(await supabase.rpc('reschedule_booking', { p_id: id, p_starts: startsIso }))
}

export async function cancelBooking(id, { asAdmin = false } = {}) {
  if (DEMO) {
    const b = demoList('bookings').find((x) => x.id === id)
    if (!b || b.status !== 'booked') throw new Error('NOT_ACTIVE')
    if (!asAdmin && !canClientChange(b)) throw new Error('LOCKED_24H')
    return demoUpdate(id, { status: 'cancelled', cancelled_by: asAdmin ? 'admin' : 'client' })
  }
  return unwrap(await supabase.rpc('cancel_booking', { p_id: id }))
}

// ── 管理員 ──────────────────────────────────────────────────────────────────

export async function adminListBookings(fromIso, toIso) {
  if (DEMO) {
    return withService(demoList('bookings').filter((b) => b.starts_at >= fromIso && b.starts_at < toIso))
      .map((b) => ({ ...b, profile: { id: b.profile_id, display_name: '體驗用戶', full_name: null } })).sort(byStart)
  }
  return unwrap(await supabase.from('bookings')
    .select(`${BOOKING_FIELDS}, profile:profiles(id, display_name, full_name, phone)`)
    .gte('starts_at', fromIso).lt('starts_at', toIso).order('starts_at'))
}

/** 標記完成／未到 */
export async function adminSetBookingStatus(id, status) {
  if (DEMO) return demoUpdate(id, { status })
  unwrap(await supabase.from('bookings').update({ status, updated_at: new Date().toISOString() }).eq('id', id))
}

export async function adminResetNoShow(profileId) {
  if (DEMO) return demoSet(`booking-reset:${profileId}`, new Date().toISOString())
  return unwrap(await supabase.rpc('admin_reset_no_show', { p_profile: profileId }))
}

export async function adminSetBookingAccess(profileId, granted) {
  if (DEMO) return demoSet(`booking-access:${profileId}`, granted ? new Date().toISOString() : null)
  if (granted) {
    const { data: { user } } = await supabase.auth.getUser()
    unwrap(await supabase.from('booking_access').upsert({ profile_id: profileId, granted_by: user?.id ?? null }))
  } else {
    unwrap(await supabase.from('booking_access').delete().eq('profile_id', profileId))
  }
}

export async function listBlocked(fromIso, toIso) {
  if (DEMO) return demoList('blocked').filter((b) => b.ends_at > fromIso && b.starts_at < toIso).sort(byStart)
  return unwrap(await supabase.from('blocked_times').select('id, starts_at, ends_at, reason')
    .lt('starts_at', toIso).gt('ends_at', fromIso).order('starts_at'))
}

export async function adminAddBlocked(startsIso, endsIso, reason) {
  if (new Date(endsIso) <= new Date(startsIso)) throw new Error('BAD_RANGE')
  const row = { starts_at: startsIso, ends_at: endsIso, reason: reason?.trim() || null }
  if (DEMO) return demoSet('blocked', [...demoList('blocked'), { id: crypto.randomUUID(), ...row }])
  unwrap(await supabase.from('blocked_times').insert(row))
}

export async function adminDeleteBlocked(id) {
  if (DEMO) return demoSet('blocked', demoList('blocked').filter((b) => b.id !== id))
  unwrap(await supabase.from('blocked_times').delete().eq('id', id))
}

export async function adminUpdateService(id, fields) {
  const row = { duration_min: Number(fields.duration_min), buffer_min: Number(fields.buffer_min), bookable: !!fields.bookable }
  if (DEMO) return demoSet('services', demoServices().map((s) => (s.id === id ? { ...s, ...row } : s)))
  unwrap(await supabase.from('services').update(row).eq('id', id))
}

// ── Demo 模式（localStorage，模擬資料庫規則） ───────────────────────────────

const byStart = (a, b) => a.starts_at.localeCompare(b.starts_at)
function withService(rows) {
  const svcs = Object.fromEntries(demoServices().map((s) => [s.id, s]))
  return rows.map((b) => ({ ...b, service: svcs[b.service_id] ?? null }))
}
function demoUpdate(id, fields) {
  demoSet('bookings', demoList('bookings').map((b) => (b.id === id ? { ...b, ...fields } : b)))
}
function demoTimes(serviceId, startsIso) {
  const svc = demoServices().find((s) => s.id === serviceId)
  if (!svc) throw new Error('NO_SERVICE')
  const s = new Date(startsIso)
  const ends = new Date(s.getTime() + svc.duration_min * 60000)
  const until = new Date(ends.getTime() + svc.buffer_min * 60000)
  return { svc, starts_at: s.toISOString(), ends_at: ends.toISOString(), block_until: until.toISOString() }
}
function demoCheck(t, asAdmin, ignoreId) {
  if (!asAdmin) {
    const date = taipeiDate(new Date(t.starts_at))
    const slot = buildSlots(date, t.svc, [], new Date()).find((x) => x.start.toISOString() === t.starts_at)
    if (isClosedDay(date)) throw new Error('CLOSED_DAY')
    if (!slot) throw new Error('OUTSIDE_HOURS')
    if (slot.state === 'past') throw new Error('TOO_SOON')
  }
  const s = new Date(t.starts_at).getTime(), u = new Date(t.block_until).getTime()
  const clash = [
    ...demoList('bookings').filter((b) => b.status === 'booked' && b.id !== ignoreId).map((b) => [b.starts_at, b.block_until]),
    ...demoList('blocked').map((b) => [b.starts_at, b.ends_at]),
  ].some(([a, b]) => overlaps(s, u, new Date(a).getTime(), new Date(b).getTime()))
  if (clash) throw new Error('SLOT_TAKEN')
}
async function demoCreate(serviceId, startsIso, note, profileId, asAdmin) {
  const t = demoTimes(serviceId, startsIso)
  if (!asAdmin) {
    if (!t.svc.bookable) throw new Error('NOT_BOOKABLE')
    if (t.svc.is_trial) {
      if (demoList('bookings').some((b) => b.profile_id === profileId && b.service_id === t.svc.id && b.status !== 'cancelled')) throw new Error('TRIAL_USED')
    } else if (!(await getBookingAccess(profileId))) throw new Error('NEED_ACCESS')
    if ((await getNoShowCount(profileId)) >= NO_SHOW_LIMIT) throw new Error('BOOKING_SUSPENDED')
    if (demoList('bookings').filter((b) => b.profile_id === profileId && isUpcoming(b)).length >= MAX_ACTIVE) throw new Error('TOO_MANY')
  }
  demoCheck(t, asAdmin)
  const id = crypto.randomUUID()
  const times = { starts_at: t.starts_at, ends_at: t.ends_at, block_until: t.block_until }
  demoSet('bookings', [...demoList('bookings'), { id, profile_id: profileId, service_id: t.svc.id, ...times, status: 'booked', cancelled_by: null, note: note?.trim() || null, created_at: new Date().toISOString() }])
  return id
}
async function demoReschedule(id, startsIso, asAdmin) {
  const b = demoList('bookings').find((x) => x.id === id)
  if (!b || b.status !== 'booked') throw new Error('NOT_ACTIVE')
  if (!asAdmin && !canClientChange(b)) throw new Error('LOCKED_24H')
  const t = demoTimes(b.service_id, startsIso)
  demoCheck(t, asAdmin, id)
  demoUpdate(id, { starts_at: t.starts_at, ends_at: t.ends_at, block_until: t.block_until })
}
