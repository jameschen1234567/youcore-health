// 管理後台資料存取。正式模式靠 RLS 的 is_admin() 放行；Demo 模式只有「體驗用戶」一位客戶。
import { DEMO } from '../config'
import { supabase } from './supabase'
import { ORDER_FIELDS, demoGet, demoKey, demoList, demoSet } from './api'
import { QUESTIONNAIRES } from '../questionnaires'

const DEMO_CLIENT = { id: 'demo-user', display_name: '體驗用戶', role: 'client', created_at: '2026-11-01T02:00:00Z' }

function demoDeletion() {
  const at = demoGet('deletion')
  return at ? [{ id: 'demo-del', profile_id: 'demo-user', requested_at: at, status: 'pending' }] : []
}

/** 客戶列表：含最近一次足部量測日期、待處理刪除申請、未完成訂單數 */
export async function adminListClients() {
  if (DEMO) {
    const foot = demoList('foot')
    return [{
      ...DEMO_CLIENT,
      last_foot_at: foot.at(-1)?.created_at ?? null,
      deletion_pending: demoDeletion().length > 0,
      open_orders: demoList('orders').filter((o) => o.status !== 'picked_up').length,
    }]
  }
  const [profiles, foot, dels, orders] = await Promise.all([
    // 管理員也列出來（可以替自己建測試訂單、看自己的資料）
    supabase.from('profiles').select('id, display_name, full_name, phone, role, created_at').order('created_at', { ascending: false }),
    supabase.from('foot_measurements').select('profile_id, created_at').order('created_at', { ascending: false }),
    supabase.from('deletion_requests').select('profile_id').eq('status', 'pending'),
    supabase.from('orders').select('profile_id, status').neq('status', 'picked_up'),
  ])
  for (const r of [profiles, foot, dels, orders]) if (r.error) throw r.error
  const lastFoot = {}
  for (const f of foot.data) lastFoot[f.profile_id] ??= f.created_at
  const delSet = new Set(dels.data.map((d) => d.profile_id))
  const open = {}
  for (const o of orders.data) open[o.profile_id] = (open[o.profile_id] ?? 0) + 1
  return profiles.data.map((p) => ({
    ...p,
    last_foot_at: lastFoot[p.id] ?? null,
    deletion_pending: delSet.has(p.id),
    open_orders: open[p.id] ?? 0,
  }))
}

/** 單一客戶的完整資料 */
export async function adminGetClient(id) {
  if (DEMO) {
    if (id !== DEMO_CLIENT.id) return null
    const responses = Object.keys(QUESTIONNAIRES).flatMap((k) => demoList(`responses:${k}`).map((r) => ({ ...r, questionnaire_key: k })))
    return {
      profile: DEMO_CLIENT,
      foot: demoList('foot'),
      responses,
      painMaps: demoList('painmaps'),
      orders: demoList('orders'),
      deletion: demoDeletion(),
    }
  }
  const q = (t, sel, order = 'created_at') =>
    supabase.from(t).select(sel).eq('profile_id', id).order(order, { ascending: true })
  const [profile, foot, responses, painMaps, orders, deletion] = await Promise.all([
    supabase.from('profiles').select('id, display_name, role, created_at').eq('id', id).maybeSingle(),
    q('foot_measurements', 'id, side, length_mm, width_mm, width_class, photo_path, quality_flags, algo_version, created_at'),
    q('questionnaire_responses', 'id, questionnaire_key, questionnaire_version, scores, computable, submitted_at', 'submitted_at'),
    q('pain_maps', 'id, regions, submitted_at', 'submitted_at'),
    supabase.from('orders').select(ORDER_FIELDS).eq('profile_id', id).order('created_at', { ascending: false }),
    supabase.from('deletion_requests').select('id, requested_at, status').eq('profile_id', id).eq('status', 'pending'),
  ])
  for (const r of [profile, foot, responses, painMaps, orders, deletion]) if (r.error) throw r.error
  if (!profile.data) return null
  return {
    profile: profile.data,
    foot: foot.data,
    responses: responses.data,
    painMaps: painMaps.data,
    orders: orders.data,
    deletion: deletion.data,
  }
}

/** 足部照片：10 分鐘有效的 signed URL */
export async function adminPhotoUrl(path) {
  if (DEMO || !path) return null
  const { data, error } = await supabase.storage.from('foot-photos').createSignedUrl(path, 600)
  if (error) throw error
  return data.signedUrl
}

export async function adminCreateOrder(profileId, productType, note) {
  if (DEMO) {
    const now = new Date().toISOString()
    const row = { id: crypto.randomUUID(), profile_id: profileId, product_type: productType, status: 'assessed', note: note || null, notified_at: null, created_at: now, updated_at: now, events: [{ status: 'assessed', created_at: now }] }
    demoSet('orders', [...demoList('orders'), row])
    return row
  }
  const { data, error } = await supabase.from('orders')
    .insert({ profile_id: profileId, product_type: productType, note: note || null })
    .select(ORDER_FIELDS).single()
  if (error) throw error
  return data
}

/** 改狀態；改成 ready 時資料庫觸發器會自動推播 LINE */
export async function adminSetOrderStatus(orderId, status) {
  if (DEMO) {
    const now = new Date().toISOString()
    const rows = demoList('orders').map((o) => o.id !== orderId ? o : {
      ...o, status, updated_at: now,
      events: [...(o.events ?? []), { status, created_at: now }],
      // 示範模式不會真的推播，只標記時間
      notified_at: status === 'ready' && !o.notified_at ? now : o.notified_at,
    })
    demoSet('orders', rows)
    return rows.find((o) => o.id === orderId)
  }
  const { data, error } = await supabase.from('orders').update({ status }).eq('id', orderId).select(ORDER_FIELDS).single()
  if (error) throw error
  return data
}

export async function adminUpdateOrderNote(orderId, note) {
  if (DEMO) {
    demoSet('orders', demoList('orders').map((o) => (o.id === orderId ? { ...o, note } : o)))
    return
  }
  const { error } = await supabase.from('orders').update({ note }).eq('id', orderId)
  if (error) throw error
}

/** 推播失敗時重送 */
export async function adminResendNotify(orderId) {
  if (DEMO) return adminSetOrderStatus(orderId, 'ready')
  const { error } = await supabase.functions.invoke('order-notify', { body: { order_id: orderId } })
  if (error) throw error
}

/** 刪除客戶全部資料（照片＋帳號，無法復原） */
export async function adminDeleteClient(profileId) {
  if (DEMO) {
    // 清掉這位示範客戶的所有資料（保留同意書，方便繼續預覽）
    for (const k of ['foot', 'orders', 'painmaps', 'deletion', ...Object.keys(QUESTIONNAIRES).map((q) => `responses:${q}`)]) {
      try { localStorage.removeItem(demoKey(k)) } catch { /* 忽略 */ }
    }
    return { photos_removed: 0 }
  }
  const { data, error } = await supabase.functions.invoke('admin-delete-profile', { body: { profile_id: profileId } })
  if (error) throw error
  return data
}

export async function adminRejectDeletion(requestId) {
  if (DEMO) return demoSet('deletion', null)
  const { error } = await supabase.from('deletion_requests').update({ status: 'rejected' }).eq('id', requestId)
  if (error) throw error
}

/** 全部客戶的足部量測（匯出 CSV 用） */
export async function adminAllFoot() {
  if (DEMO) return demoList('foot').map((f) => ({ ...f, client_name: DEMO_CLIENT.display_name }))
  const { data, error } = await supabase.from('foot_measurements')
    .select('side, length_mm, width_mm, created_at, algo_version, profile:profiles(display_name)')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map((r) => ({ ...r, client_name: r.profile?.display_name }))
}

export async function adminLastSync() {
  if (DEMO) return demoGet('lastSync')
  const { data, error } = await supabase.from('sync_logs').select('started_at, finished_at, ok, items_synced, error')
    .order('started_at', { ascending: false }).limit(1)
  if (error) throw error
  return data[0] ?? null
}

export async function adminRunSync() {
  if (DEMO) {
    const now = new Date().toISOString()
    const log = { started_at: now, finished_at: now, ok: true, items_synced: 0, error: null, demo: true }
    demoSet('lastSync', log)
    return log
  }
  const { error } = await supabase.functions.invoke('notion-sync', { body: {} })
  if (error) throw error
  return adminLastSync()
}
