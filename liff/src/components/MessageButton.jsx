import { lineMessageUrl } from '../lib/booking'

export function MessageButton({ text, label = '傳 LINE 訊息給我們' }) {
  const href = lineMessageUrl(text)
  return href
    ? <a className="btn primary block" href={href}>{label}</a>
    : <button className="btn primary block" disabled>{label}</button>
}
