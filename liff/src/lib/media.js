// 會員影像紀錄：照片（私有空間）、Before/After 對照、影片連結（Google 雲端／YouTube）
// 規則見 supabase/migrations/0033_member_media.sql
import { DEMO } from '../config'
import { supabase } from './supabase'
import { demoGet, demoList, demoSet } from './api'
import { prepareImage } from './image'

const BUCKET = 'member-media'
const unwrap = ({ data, error }) => { if (error) throw error; return data }
export const KIND_LABEL = { photo: '照片', compare: 'Before／After', video: '影片' }

// ── 影片連結解析（純函式） ─────────────────────────────────────────────────

/** 回傳 { provider: 'drive' | 'youtube', id, embed } 或 null */
export function parseVideoUrl(raw) {
  const s = (raw ?? '').trim()
  let u
  try { u = new URL(s) } catch { return null }
  if (u.protocol !== 'https:') return null
  const host = u.hostname.replace(/^www\./, '')
  if (host === 'drive.google.com' || host === 'docs.google.com') {
    const m = u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/)
    const id = m?.[1] ?? u.searchParams.get('id')
    if (!id || !/^[A-Za-z0-9_-]{10,}$/.test(id)) return null
    return { provider: 'drive', id, embed: `https://drive.google.com/file/d/${id}/preview` }
  }
  let yt = null
  if (host === 'youtu.be') yt = u.pathname.slice(1).split('/')[0]
  else if (host === 'youtube.com' || host === 'm.youtube.com') {
    yt = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)?.[1] ?? null
  }
  if (yt && /^[A-Za-z0-9_-]{11}$/.test(yt)) return { provider: 'youtube', id: yt, embed: `https://www.youtube-nocookie.com/embed/${yt}` }
  return null
}

export function validateMedia(v) {
  if (!v.title?.trim()) return '請填標題'
  if (v.title.trim().length > 60) return '標題最多 60 字'
  if (!v.taken_on) return '請填日期'
  if ((v.note ?? '').length > 2000) return '講解最多 2000 字'
  if (!v.id) {
    if (v.kind === 'photo' && !v.file1) return '請選一張照片'
    if (v.kind === 'compare' && (!v.file1 || !v.file2)) return '請選 Before 與 After 兩張照片'
  }
  if (v.kind === 'video' && !parseVideoUrl(v.video_url)) return '影片連結看不懂：請貼 Google 雲端分享連結或 YouTube 連結'
  return null
}

// ── 讀取 ──────────────────────────────────────────────────────────────────

const FIELDS = 'id, profile_id, kind, title, note, taken_on, session_id, photo_path, photo2_path, video_url, created_at'

/** 某客戶的影像（新的在前），可指定只看某次訓練 */
export async function listMedia(profileId, { sessionId } = {}) {
  if (DEMO) {
    return demoList(`media:${profileId}`).filter((m) => !sessionId || m.session_id === sessionId)
      .sort((a, b) => b.taken_on.localeCompare(a.taken_on) || b.created_at.localeCompare(a.created_at))
  }
  let q = supabase.from('member_media').select(FIELDS).eq('profile_id', profileId)
  if (sessionId) q = q.eq('session_id', sessionId)
  return unwrap(await q.order('taken_on', { ascending: false }).order('created_at', { ascending: false }))
}

/** 照片路徑 → 10 分鐘有效的臨時網址 { path: url } */
export async function signedUrls(items) {
  const paths = [...new Set(items.flatMap((m) => [m.photo_path, m.photo2_path]).filter(Boolean))]
  if (paths.length === 0) return {}
  if (DEMO) return Object.fromEntries(paths.map((p) => [p, demoGet(`media-file:${p}`)]))
  const data = unwrap(await supabase.storage.from(BUCKET).createSignedUrls(paths, 600))
  return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]))
}

// ── 管理員 ────────────────────────────────────────────────────────────────

export async function adminSetMediaConsent(profileId, on) {
  const v = on ? new Date().toISOString() : null
  if (DEMO) { demoSet(`media-consent:${profileId}`, v); return v }
  unwrap(await supabase.from('profiles').update({ media_consent_at: v }).eq('id', profileId))
  return v
}

export async function getMediaConsent(profileId) {
  if (DEMO) return demoGet(`media-consent:${profileId}`) ?? null
  return unwrap(await supabase.from('profiles').select('media_consent_at').eq('id', profileId).single()).media_consent_at
}

async function uploadPhoto(profileId, file) {
  const blob = await prepareImage(file)
  const path = `${profileId}/${crypto.randomUUID()}.jpg`
  if (DEMO) {
    const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob) })
    demoSet(`media-file:${path}`, url)
    return path
  }
  unwrap(await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false }))
  return path
}

async function removeFiles(paths) {
  const ps = paths.filter(Boolean)
  if (ps.length === 0) return
  if (DEMO) { ps.forEach((p) => localStorage.removeItem(`youcore-demo:media-file:${p}`)); return }
  const { error } = await supabase.storage.from(BUCKET).remove(ps)
  if (error) console.warn('刪除照片檔失敗', error)
}

/** 新增或修改。新增照片時先上傳檔案，資料寫入失敗會把剛上傳的檔案刪掉 */
export async function adminSaveMedia(profileId, v) {
  const base = {
    title: v.title.trim(),
    note: v.note?.trim() || null,
    taken_on: v.taken_on,
    session_id: v.session_id || null,
  }
  if (v.id) {
    const patch = { ...base, ...(v.kind === 'video' ? { video_url: v.video_url.trim() } : {}) }
    if (DEMO) return demoSet(`media:${profileId}`, demoList(`media:${profileId}`).map((m) => (m.id === v.id ? { ...m, ...patch } : m)))
    unwrap(await supabase.from('member_media').update(patch).eq('id', v.id))
    return
  }
  const uploaded = []
  try {
    const row = { profile_id: profileId, kind: v.kind, ...base, photo_path: null, photo2_path: null, video_url: null }
    if (v.kind === 'video') row.video_url = v.video_url.trim()
    else {
      row.photo_path = await uploadPhoto(profileId, v.file1); uploaded.push(row.photo_path)
      if (v.kind === 'compare') { row.photo2_path = await uploadPhoto(profileId, v.file2); uploaded.push(row.photo2_path) }
    }
    if (DEMO) {
      demoSet(`media:${profileId}`, [...demoList(`media:${profileId}`), { id: crypto.randomUUID(), ...row, created_at: new Date().toISOString() }])
      return
    }
    unwrap(await supabase.from('member_media').insert(row))
  } catch (e) {
    await removeFiles(uploaded)
    throw e
  }
}

export async function adminDeleteMedia(profileId, m) {
  if (DEMO) demoSet(`media:${profileId}`, demoList(`media:${profileId}`).filter((x) => x.id !== m.id))
  else unwrap(await supabase.from('member_media').delete().eq('id', m.id))
  await removeFiles([m.photo_path, m.photo2_path])
}
