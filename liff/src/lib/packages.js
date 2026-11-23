// 課程包（堂數與到期日）— 只給管理員看。規則見 supabase/migrations/0011_packages.sql
import { DEMO } from '../config'
import { supabase } from './supabase'
import { demoGet, demoSet } from './api'

const unwrap = ({ data, error }) => { if (error) throw error; return data }
const todayTaipei = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())

/** 課程包狀態：已用、剩餘、是否到期 */
export function packageStats(pkg, today = todayTaipei()) {
  const used = (pkg.usages ?? []).reduce((n, u) => n + u.amount, 0)
  const remaining = pkg.total - used
  const expired = !!pkg.expires_on && pkg.expires_on < today
  const status = expired ? 'expired' : remaining <= 0 ? 'used_up' : 'active'
  return { used, remaining, expired, status }
}
export const PACKAGE_STATUS = { active: '使用中', expired: '已到期', used_up: '已用完' }

/** 距到期天數（null = 不限期） */
export function daysLeft(expiresOn, today = todayTaipei()) {
  if (!expiresOn) return null
  return Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5)
}

/**
 * 預約完成時要扣哪一包：同客戶、同服務、上課日未過期、還有剩餘，最早到期的優先（與資料庫觸發器相同規則）
 */
export function pickPackage(packages, profileId, serviceId, date) {
  return packages
    .filter((p) => p.profile_id === profileId && p.service_id === serviceId)
    .filter((p) => !p.expires_on || p.expires_on >= date)
    .filter((p) => packageStats(p, date).remaining > 0)
    .sort((a, b) => (a.expires_on ?? '9999').localeCompare(b.expires_on ?? '9999') || a.created_at.localeCompare(b.created_at))[0] ?? null
}

const PKG_FIELDS = 'id, profile_id, service_id, total, starts_on, expires_on, note, created_at, service:services(name), usages:package_usages(id, amount, kind, note, created_at, booking_id, booking:bookings(starts_at))'

export async function adminListPackages(profileId) {
  if (DEMO) return demoPackages().filter((p) => p.profile_id === profileId).map(demoWithJoins).sort((a, b) => b.created_at.localeCompare(a.created_at))
  return unwrap(await supabase.from('packages').select(PKG_FIELDS).eq('profile_id', profileId).order('created_at', { ascending: false }))
}

export async function adminCreatePackage({ profileId, serviceId, total, startsOn, expiresOn, note }) {
  const row = {
    profile_id: profileId, service_id: serviceId, total: Number(total),
    starts_on: startsOn || todayTaipei(), expires_on: expiresOn || null, note: note?.trim() || null,
  }
  if (!row.service_id || !(row.total >= 1)) throw new Error('BAD_INPUT')
  if (DEMO) return demoSet('packages', [...demoPackages(), { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row }])
  unwrap(await supabase.from('packages').insert(row))
}

/** 改到期日（延期）、總堂數或備註 */
export async function adminUpdatePackage(id, fields) {
  const row = {}
  if ('expires_on' in fields) row.expires_on = fields.expires_on || null
  if ('total' in fields) row.total = Number(fields.total)
  if ('note' in fields) row.note = fields.note?.trim() || null
  if (DEMO) return demoSet('packages', demoPackages().map((p) => (p.id === id ? { ...p, ...row } : p)))
  unwrap(await supabase.from('packages').update(row).eq('id', id))
}

export async function adminDeletePackage(id) {
  if (DEMO) {
    demoSet('packageUsages', demoUsages().filter((u) => u.package_id !== id))
    return demoSet('packages', demoPackages().filter((p) => p.id !== id))
  }
  unwrap(await supabase.from('packages').delete().eq('id', id))
}

/** 手動扣堂（amount = 1）或補堂（amount = -1） */
export async function adminAdjustPackage(id, amount, note) {
  const row = { package_id: id, amount, kind: 'manual', note: note?.trim() || null }
  if (DEMO) return demoSet('packageUsages', [...demoUsages(), { id: crypto.randomUUID(), booking_id: null, created_at: new Date().toISOString(), ...row }])
  unwrap(await supabase.from('package_usages').insert(row))
}

/** 預約 id → 扣堂結果 { serviceName, remaining, expires_on } */
export async function adminUsagesForBookings(bookingIds) {
  if (!bookingIds.length) return {}
  let rows
  if (DEMO) {
    rows = demoUsages().filter((u) => bookingIds.includes(u.booking_id))
      .map((u) => ({ booking_id: u.booking_id, package: demoWithJoins(demoPackages().find((p) => p.id === u.package_id)) }))
  } else {
    rows = unwrap(await supabase.from('package_usages')
      .select('booking_id, package:packages(id, total, expires_on, usages:package_usages(amount))').in('booking_id', bookingIds))
  }
  return Object.fromEntries(rows.filter((r) => r.package).map((r) => [r.booking_id, {
    remaining: packageStats(r.package).remaining, expires_on: r.package.expires_on,
  }]))
}

// ── Demo（模擬資料庫觸發器） ──────────────────────────────────────────────

const demoPackages = () => demoGet('packages') ?? []
const demoUsages = () => demoGet('packageUsages') ?? []
function demoWithJoins(p) {
  if (!p) return null
  const services = demoGet('services') ?? []
  const bookings = demoGet('bookings') ?? []
  return {
    ...p,
    service: { name: services.find((s) => s.id === p.service_id)?.name ?? DEMO_SERVICE_NAMES[p.service_id] ?? '服務' },
    usages: demoUsages().filter((u) => u.package_id === p.id)
      .map((u) => ({ ...u, booking: bookings.find((b) => b.id === u.booking_id) ?? null })),
  }
}
const DEMO_SERVICE_NAMES = { 'svc-1': '科技結合運動按摩', 'svc-2': '一對一肌力與體能課程', 'svc-3': '運動傷害防護與康復訓練' }

/** demo：預約狀態改變時套用扣堂／退堂 */
export function demoApplyPackage(booking, oldStatus, newStatus) {
  if (newStatus === 'completed' && oldStatus !== 'completed') {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date(booking.starts_at))
    const pkg = pickPackage(demoPackages().map(demoWithJoins), booking.profile_id, booking.service_id, date)
    if (pkg && !demoUsages().some((u) => u.booking_id === booking.id)) {
      demoSet('packageUsages', [...demoUsages(), { id: crypto.randomUUID(), package_id: pkg.id, booking_id: booking.id, amount: 1, kind: 'booking', note: null, created_at: new Date().toISOString() }])
    }
  } else if (oldStatus === 'completed' && newStatus !== 'completed') {
    demoSet('packageUsages', demoUsages().filter((u) => !(u.booking_id === booking.id && u.kind === 'booking')))
  }
}
