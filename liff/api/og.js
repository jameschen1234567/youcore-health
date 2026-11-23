/* global process */
// 文章分享預覽：/content/:id 先經過這裡，把 index.html 補上 og:title／og:image 等標籤，
// 讓 LINE、FB、IG 貼連結時顯示文章標題與封面。頁面本身仍由前端 App 渲染。
const BRAND = '宥芯健筋療育所'
const DEFAULT_DESC = '臺師大運動科學背景的防護員，用運動醫學幫你找出痠痛根源｜台北南港後山埤'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** 內文第一段純文字當描述 */
export function firstText(body, max = 80) {
  for (const b of body ?? []) {
    const t = (b.text ?? []).map((p) => p.text).join('').trim()
    if (t && b.type !== 'heading_1' && b.type !== 'heading_2' && b.type !== 'heading_3') return t.length > max ? `${t.slice(0, max)}…` : t
  }
  return ''
}

export function injectMeta(html, { title, description, image, url }) {
  const tags = [
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="${esc(BRAND)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    image ? `<meta property="og:image" content="${esc(image)}" />` : '',
    `<meta name="description" content="${esc(description)}" />`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
  ].filter(Boolean).join('\n    ')
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}｜${esc(BRAND)}</title>`)
    .replace('</head>', `    ${tags}\n  </head>`)
}

export default async function handler(req, res) {
  const id = String(req.query.id ?? '')
  const origin = `https://${req.headers['x-forwarded-host'] ?? req.headers.host}`
  const url = `${origin}/content/${id}`
  let html
  try {
    html = await fetch(`${origin}/index.html`).then((r) => r.text())
  } catch {
    res.statusCode = 302
    res.setHeader('Location', `/#/content/${encodeURIComponent(id)}`)
    return res.end()
  }

  let meta = { title: BRAND, description: DEFAULT_DESC, image: null, url }
  const base = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_ANON_KEY
  if (UUID.test(id) && base && key) {
    try {
      const r = await fetch(`${base}/rest/v1/content_items?id=eq.${id}&select=title,cover_url,body`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      })
      const [item] = r.ok ? await r.json() : []
      if (item) meta = { title: item.title, description: firstText(item.body) || DEFAULT_DESC, image: item.cover_url, url }
    } catch { /* 用預設描述 */ }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600')
  res.end(injectMeta(html, meta))
}
