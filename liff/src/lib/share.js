// 分享文章：LINE 裡用好友選擇器（客人自己傳，不吃官方帳號訊息額度）；其他瀏覽器用系統分享或 LINE 分享頁
import { DEMO } from '../config'
import { liffReady } from './liffClient'

/** 文章公開網址（免登入可看；/content/:id 會由 Vercel 函式補上預覽標題與封面） */
export const contentUrl = (id, origin = window.location.origin) => `${origin}/content/${id}`

export const shareText = (title, url) => `推薦你看這篇👇\n「${title}」\n${url}\n\n— 宥芯健筋療育所`

/** 回傳 'picker' | 'native' | 'line-web' | 'cancelled' */
export async function shareContent({ id, title }) {
  const url = contentUrl(id)
  const text = shareText(title, url)
  if (!DEMO) {
    try {
      const liff = await liffReady()
      if (liff.isInClient() && liff.isLoggedIn() && liff.isApiAvailable('shareTargetPicker')) {
        const r = await liff.shareTargetPicker([{ type: 'text', text }], { isMultiple: true })
        return r ? 'picker' : 'cancelled'
      }
    } catch { /* 改用下面的方式 */ }
  }
  if (navigator.share) {
    try {
      await navigator.share({ title, text: `推薦你看這篇：「${title}」— 宥芯健筋療育所`, url })
      return 'native'
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled'
    }
  }
  window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`, '_blank', 'noopener')
  return 'line-web'
}

export async function copyLink(id) {
  await navigator.clipboard.writeText(contentUrl(id))
}
