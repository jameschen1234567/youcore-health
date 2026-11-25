// 後台：意見回饋（App 內回覆免費；要傳到 LINE 就複製後到聊天室手動貼上，一對一聊天不計費）
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FB_STATUS, LINE_KEYWORD, MAX_LEN, addMessage, adminListFeedback, adminSetFeedbackStatus, markRead, topicLabel } from '../../lib/feedback'
import FeedbackThread from '../../components/FeedbackThread'

const FILTERS = [['active', '處理中'], ['all', '全部']]

export default function AdminFeedback() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('active')
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const reload = useCallback(() => adminListFeedback(filter).then((r) => { setRows(r); setErr('') }).catch(() => setErr('載入失敗')), [filter])
  useEffect(() => { reload() }, [reload])
  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/admin')}>‹ 管理後台</button>
      <h1>意見回饋</h1>
      <p className="muted small">在這裡回覆，客戶會在 App 看到，不扣 LINE 額度，但客戶不會收到 LINE 通知。想讓他馬上知道，按「複製」後到 LINE 官方帳號聊天室貼上（一對一聊天不計費）。</p>
      <p className="muted small">LINE 自動回應關鍵字：「{LINE_KEYWORD}」</p>
      <div className="chips">{FILTERS.map(([k, t]) => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{t}</button>)}</div>
      {err && <p className="error">{err}</p>}
      {rows?.length === 0 && <p className="muted">目前沒有意見回饋</p>}
      {(rows ?? []).map((r) => <Row key={r.id} r={r} onChanged={reload} />)}
    </main>
  )
}

function Row({ r, onChanged }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const p = r.profile
  const name = p?.full_name || p?.display_name || '客戶'
  const run = async (fn, ok) => {
    setBusy(true)
    setMsg('')
    try { await fn(); setMsg(ok ?? ''); await onChanged() } catch { setMsg('操作失敗，請稍後再試') } finally { setBusy(false) }
  }
  const copy = async () => {
    const t = text.trim() || [...r.messages].reverse().find((m) => m.from_admin)?.body
    if (!t) return setMsg('還沒有可以複製的回覆')
    try { await navigator.clipboard.writeText(`${name} 你好，關於你的意見回饋（${topicLabel(r.topic)}）：\n${t}`); setMsg('已複製，可到 LINE 聊天室貼上') } catch { setMsg('無法複製') }
  }
  return (
    <section className="card">
      <div className="row spread">
        <Link to={`/admin/client/${r.profile_id}`}><b>{name}</b></Link>
        <span>{r.admin_unread && <span className="dot">未讀</span>}<span className="pill">{FB_STATUS[r.status]}</span></span>
      </div>
      <p className="muted small">{topicLabel(r.topic)}{p?.display_name ? `｜LINE：${p.display_name}` : ''}</p>
      <FeedbackThread messages={r.messages} adminLabel="我們" />
      <textarea className="fb-input" rows={3} maxLength={MAX_LEN} value={text} aria-label={`回覆 ${name}`} placeholder="回覆內容" onChange={(e) => setText(e.target.value)} />
      <button className="btn primary block" disabled={busy || !text.trim()} onClick={() => run(async () => { await addMessage(r.id, text, true); setText('') }, '已回覆，客戶可在 App 看到')}>{busy ? '處理中…' : '在 App 回覆'}</button>
      <div className="row">
        <button className="btn ghost" onClick={copy}>複製</button>
        <a className="btn ghost" href="https://chat.line.biz/" target="_blank" rel="noopener noreferrer">開 LINE 聊天室</a>
        {r.admin_unread && <button className="btn ghost" disabled={busy} onClick={() => run(() => markRead(r.id, true))}>標記已讀</button>}
        {r.status === 'closed'
          ? <button className="btn ghost" disabled={busy} onClick={() => run(() => adminSetFeedbackStatus(r.id, 'open'))}>重新開啟</button>
          : <button className="btn ghost" disabled={busy} onClick={() => run(() => adminSetFeedbackStatus(r.id, 'closed'))}>結案</button>}
      </div>
      {msg && <p className="muted small">{msg}</p>}
    </section>
  )
}
