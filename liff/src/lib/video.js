// YouTube／IG 網址 → 可嵌入的 iframe 網址；認不得就回傳 null
export function toEmbedUrl(raw) {
  if (!raw) return null
  let u
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\.|^m\./, '')

  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0]
    return id ? youtube(id) : null
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') return u.searchParams.get('v') ? youtube(u.searchParams.get('v')) : null
    const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]+)/)
    return m ? youtube(m[2]) : null
  }
  if (host === 'instagram.com') {
    const m = u.pathname.match(/^\/(p|reel|reels|tv)\/([\w-]+)/)
    if (!m) return null
    const kind = m[1] === 'reels' ? 'reel' : m[1]
    return `https://www.instagram.com/${kind}/${m[2]}/embed`
  }
  return null
}

const youtube = (id) => `https://www.youtube-nocookie.com/embed/${id}`

// 直式影片（Shorts、IG）用 9:16，其他 16:9
export function isVertical(raw) {
  return /youtube\.com\/shorts\/|instagram\.com\//.test(raw ?? '')
}

// 自己存的影片檔（Notion 上傳 → Supabase Storage），用原生 <video> 播放，不出現 YouTube 介面
export function isVideoFile(raw) {
  if (!raw) return false
  try {
    const u = new URL(raw)
    return /\.(mp4|mov|webm|m4v)$/i.test(u.pathname)
  } catch {
    return false
  }
}
