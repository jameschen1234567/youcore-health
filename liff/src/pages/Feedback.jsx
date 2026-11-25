// 會員意見回饋：選類別填寫、看回覆、追問
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { FB_STATUS, LINE_KEYWORD, MAX_LEN, TOPICS, addMessage, feedbackError, feedbackErrorText, listMyFeedback, markRead, submitFeedback, topicLabel } from '../lib/feedback'
import { MessageButton } from '../components/MessageButton'
import FeedbackThread from '../components/FeedbackThread'

export default function Feedback() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [topic, setTopic] = useState('')
  const [body, setBody] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [loadErr, setLoadErr] = useState(false)
  const reload = useCallback(() => listMyFeedback(profile.id).then((r) => { setRows(r); setLoadErr(false) }).catch(() => setLoadErr(true)), [profile.id])
  useEffect(() => { reload() }, [reload])

  async function send() {
    const e = feedbackError(topic, body)
    if (e) return setErr(e)
    setBusy(true)
    setErr('')
    try { await submitFeedback(profile.id, topic, body); setBody(''); setTopic(''); setSent(true); window.scrollTo(0, 0); await reload() } catch (x) { setErr(feedbackErrorText(x)) } finally { setBusy(false) }
  }

  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/me')}>‹ 我的</button>
      <h1>意見回饋</h1>
      {sent && (
        <section className="card">
          <p className="banner ok">✓ 已收到你的訊息，請稍待回覆。</p>
          <p className="muted small">回覆會顯示在這一頁。想同時在 LINE 留個紀錄，可以點下面按鈕把訊息傳給我們。</p>
          <MessageButton text={LINE_KEYWORD} label="傳 LINE 通知我們" />
          <button className="btn ghost block" onClick={() => setSent(false)}>再寫一筆</button>
        </section>
      )}
      {!sent && (
        <section className="card">
          <p className="small"><b>想跟我們說哪一部分？</b></p>
          <div className="chips wrap">{TOPICS.map(([k, t]) => <button key={k} className={`chip ${topic === k ? 'on' : ''}`} aria-pressed={topic === k} onClick={() => { setTopic(k); setErr('') }}>{t}</button>)}</div>
          <label className="small">內容<textarea className="fb-input" rows={5} maxLength={MAX_LEN} value={body} onChange={(e) => { setBody(e.target.value); setErr('') }} placeholder="發生什麼事、希望怎麼改，都可以告訴我們" /></label>
          <p className="muted small">緊急或身體不適請不要用這裡，直接來電或就醫。</p>
          {err && <p className="error small" role="alert">{err}</p>}
          <button className="btn primary block" disabled={busy} onClick={send}>{busy ? '送出中…' : '送出'}</button>
        </section>
      )}
      {loadErr && <p className="error">紀錄載入失敗，請稍後再試</p>}
      {rows?.length > 0 && <h2 className="section-title">我的回饋</h2>}
      {(rows ?? []).map((r) => <Item key={r.id} r={r} onChanged={reload} />)}
    </main>
  )
}

function Item({ r, onChanged }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function toggle() {
    setOpen(!open)
    if (!open && r.client_unread) { try { await markRead(r.id, false); await onChanged() } catch { /* 下次再標記 */ } }
  }
  async function add() {
    const e = feedbackError(r.topic, text)
    if (e) return setErr(e)
    setBusy(true)
    setErr('')
    try { await addMessage(r.id, text, false); setText(''); await onChanged() } catch (x) { setErr(feedbackErrorText(x)) } finally { setBusy(false) }
  }
  return (
    <section className="card">
      <button className="fb-head" aria-expanded={open} onClick={toggle}>
        <span><b>{topicLabel(r.topic)}</b>{r.client_unread && <span className="dot">新回覆</span>}</span>
        <span className="pill">{FB_STATUS[r.status]}</span>
      </button>
      {!open && <p className="muted small fb-peek">{r.messages.at(-1)?.body}</p>}
      {open && (
        <>
          <FeedbackThread messages={r.messages} />
          {r.status === 'closed' ? <p className="muted small">這筆已結案。</p> : (
            <>
              <textarea className="fb-input" rows={2} maxLength={MAX_LEN} value={text} aria-label="補充說明" placeholder="補充說明" onChange={(e) => setText(e.target.value)} />
              {err && <p className="error small">{err}</p>}
              <button className="btn ghost block" disabled={busy || !text.trim()} onClick={add}>{busy ? '送出中…' : '補充'}</button>
            </>
          )}
        </>
      )}
    </section>
  )
}
