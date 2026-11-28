// iPhone「捷徑」自動同步（步數、活動能量、安靜心率）。規則見 supabase/migrations/0037_health_sync.sql
// 同步碼只顯示一次；資料庫只存雜湊。捷徑呼叫 rpc/health_sync，一次一天。
import { DEMO, LIFF_ID } from '../config'
import { supabase } from './supabase'
import { demoGet, demoSet } from './api'

const unwrap = ({ data, error }) => { if (error) throw error; return data }

/** { created_at, last_sync_at } 或 null（沒設定） */
export async function getSyncStatus(profileId) {
  if (DEMO) return demoGet(`healthsync:${profileId}`) ?? null
  return unwrap(await supabase.from('health_sync_tokens').select('created_at, last_sync_at').eq('profile_id', profileId).maybeSingle())
}

/** 產生新同步碼（舊的立刻失效），回傳明碼 */
export async function issueSyncToken(profileId) {
  if (DEMO) {
    const tok = `yc_demo${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`
    demoSet(`healthsync:${profileId}`, { created_at: new Date().toISOString(), last_sync_at: null })
    return tok
  }
  return unwrap(await supabase.rpc('health_sync_issue'))
}

/** 停用；管理員可帶 target 停用某位客人 */
export async function revokeSync(profileId, asAdmin = false) {
  if (DEMO) return demoSet(`healthsync:${profileId}`, null)
  unwrap(await supabase.rpc('health_sync_revoke', asAdmin ? { target: profileId } : {}))
}

/** 「11/28 22:01」；沒同步過回傳 null */
export function fmtSyncTime(iso) {
  if (!iso) return null
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.month}/${p.day} ${p.hour}:${p.minute}`
}

/** 超過 2 天沒同步就提醒 */
export function isStale(lastSyncIso, now = new Date()) {
  if (!lastSyncIso) return false
  return now - new Date(lastSyncIso) > 2 * 24 * 3600 * 1000
}

export const SHORTCUT_NAME = '宥芯同步'

/** 開啟並執行捷徑；有 LIFF_ID 就跑完自動回到 LINE 裡的 App */
export function runShortcutUrl(liffId = LIFF_ID) {
  const q = new URLSearchParams({ name: SHORTCUT_NAME })
  if (liffId) q.set('x-success', `https://liff.line.me/${liffId}`)
  return `shortcuts://x-callback-url/run-shortcut?${q.toString().replace(/\+/g, '%20')}`
}

/** iPhone／iPad（iPadOS 會偽裝成 Mac，用觸控點判斷） */
export function isIOS(nav = globalThis.navigator) {
  if (!nav) return false
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
}
