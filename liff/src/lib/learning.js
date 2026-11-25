// 互動模擬教室：教材放在私有 bucket，權限以月計（規則見 supabase/migrations/0020_learning.sql）
import { DEMO, DEMO_ROLE } from '../config'
import { supabase } from './supabase'
import { demoList, demoSet } from './api'
import { todayTaipei } from './training'

const unwrap = ({ data, error }) => { if (error) throw error; return data }
const BUCKET = 'learning'
export const MONTH_PRESETS = [1, 3, 6, 12]
export const MAX_HTML_MB = 5

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
/** 起始日 + N 個月 − 1 天（月底對齊規則同 PostgreSQL：沒有那一天就取月底） */
export function endDate(start, months) {
  const [y, m, d] = start.split('-').map(Number)
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate()
  return addDays(new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10), -1)
}
export function learningStatus(grants, today = todayTaipei()) {
  const valid = (grants ?? []).filter((g) => !g.revoked_at && g.expires_on >= today).sort((a, b) => (a.starts_on < b.starts_on ? -1 : 1))
  return { active: valid.some((g) => g.starts_on <= today), until: valid.length ? valid.map((g) => g.expires_on).sort().at(-1) : null, startsLater: valid.length > 0 && valid[0].starts_on > today ? valid[0].starts_on : null }
}
/** 下一次開通的起始日：有效期內就接在後面 */
export const nextStart = (grants, today = todayTaipei()) => { const { until } = learningStatus(grants, today); return until ? addDays(until, 1) : today }

export async function listModules() {
  if (DEMO) return [{ id: 'm1', title: '深蹲代償鏈 3D 模擬', summary: '示範教材', path: 'demo.html', sort: 1, published: true }]
  return unwrap(await supabase.from('learning_modules').select('id, title, summary, path, sort, published').order('sort').order('created_at'))
}
export async function listGrants(profileId) {
  if (DEMO) return demoList('learning')
  return unwrap(await supabase.from('learning_grants').select('id, months, starts_on, expires_on, revoked_at, created_at').eq('profile_id', profileId).order('created_at', { ascending: false }))
}
export async function canLearn(profileId, role) {
  if (role === 'admin') return { active: true, until: null }
  return learningStatus(await listGrants(profileId))
}
/** 下載教材 HTML（沒有權限時 storage 會拒絕） */
export async function loadModuleHtml(path) {
  if (DEMO) {
    if (DEMO_ROLE !== 'admin' && !learningStatus(demoList('learning')).active) throw new Error('NO_ACCESS')
    return '<!doctype html><meta charset="utf-8"><p style="font:18px sans-serif;padding:24px">示範教材<script>document.body.dataset.ok=1</' + 'script></p>'
  }
  return (await unwrap(await supabase.storage.from(BUCKET).download(path))).text()
}

// ── 後台 ──
export async function adminGrantLearning(profileId, months) {
  if (DEMO) {
    const s = nextStart(demoList('learning'))
    return demoSet('learning', [{ id: crypto.randomUUID(), months, starts_on: s, expires_on: endDate(s, months), revoked_at: null, created_at: new Date().toISOString() }, ...demoList('learning')])
  }
  return unwrap(await supabase.rpc('grant_learning', { p_profile: profileId, p_months: months }))
}
export async function adminRevokeLearning(profileId) {
  if (DEMO) return demoSet('learning', demoList('learning').map((g) => ({ ...g, revoked_at: g.revoked_at ?? new Date().toISOString() })))
  return unwrap(await supabase.rpc('revoke_learning', { p_profile: profileId }))
}
/** 新增教材（上傳 HTML）或更新；file 可省略 */
export async function adminSaveModule(id, row, file) {
  if (DEMO) return null
  let path = row.path
  if (file) {
    if (file.size > MAX_HTML_MB * 1048576) throw new Error('TOO_LARGE')
    path ??= `${crypto.randomUUID()}.html`
    unwrap(await supabase.storage.from(BUCKET).upload(path, new Blob([file], { type: 'text/html' }), { contentType: 'text/html', upsert: true, cacheControl: '60' }))
  }
  const v = { title: row.title, summary: row.summary || null, sort: row.sort, published: row.published }
  return unwrap(id
    ? await supabase.from('learning_modules').update(v).eq('id', id).select().single()
    : await supabase.from('learning_modules').insert({ ...v, path }).select().single())
}
