// 直播留言區：每 4 秒更新；host = 主持畫面（置頂、已回答、刪除、禁言）
import { useCallback, useEffect, useRef, useState } from 'react'
import { taipeiTime } from '../lib/booking'
import { MAX_BODY, POLL_MS, chatErrorText, getFeed, mergeComments, moderate, postComment, sendLikes } from '../lib/liveChat'

const HOST_FILTERS = [['all', '全部'], ['open', '未回答'], ['private', '私下提問']]

export default function LiveChat({ streamId, host = false }) {
  const [comments, setComments] = useState([])
  const [info, setInfo] = useState(null) // { phase, likes, muted }
  const [offline, setOffline] = useState(false)
  const [filter, setFilter] = useState('all')
  const [pendingLikes, setPendingLikes] = useState(0)
  const since = useRef(null)
  const likes = useRef(0)
  const phase = useRef(null)
  const listRef = useRef(null)
  const stick = useRef(true) // 使用者停在最底部時，新留言自動捲動

  const refresh = useCallback(async () => {
    // 按讚先累積，跟著更新一起送出，節省請求
    const n = likes.current
    if (n > 0 && phase.current === 'live') {
      try { await sendLikes(streamId, Math.min(n, 50)); likes.current -= Math.min(n, 50) } catch { likes.current = 0 }
      setPendingLikes(likes.current)
    }
    try {
      const f = await getFeed(streamId, since.current)
      since.current = f.now
      phase.current = f.phase
      setInfo({ phase: f.phase, likes: Number(f.likes), muted: f.muted })
      setComments((cur) => mergeComments(cur, f.comments))
      setOffline(false)
    } catch { setOffline(true) }
  }, [streamId])

  useEffect(() => {
    let timer, stopped = false
    since.current = null
    const tick = async () => {
      // 切到背景時不更新；回放不需要一直更新
      if (!document.hidden) await refresh()
      if (!stopped) timer = setTimeout(tick, phase.current === 'live' || phase.current === null ? POLL_MS : 60000)
    }
    tick()
    const onShow = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', onShow)
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onShow) }
  }, [refresh])

  useEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [comments, filter])

  const onScroll = (e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40 }
  function like() { if (likes.current < 200) { likes.current += 1; setPendingLikes(likes.current) } }

  const live = info?.phase === 'live'
  const pinned = comments.find((c) => c.pinned)
  const shown = comments.filter((c) => !host || filter === 'all' || (filter === 'private' ? c.private : !c.answered && !c.is_host))

  return (
    <section className="card chat">
      <div className="row spread head-row">
        <h2>留言{host ? `（${comments.length}）` : ''}</h2>
        <button className="like-btn" disabled={!live} onClick={like} aria-label="按讚">❤️ {(info?.likes ?? 0) + pendingLikes}</button>
      </div>
      {host && (
        <div className="chips">
          {HOST_FILTERS.map(([k, label]) => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{label}</button>)}
        </div>
      )}
      {offline && <p className="error small">連線不穩，重新連線中…</p>}
      {pinned && <div className="chat-pinned"><span className="small">📌 {pinned.name}</span><p>{pinned.body}</p></div>}
      <div className={`chat-list ${host ? 'host' : ''}`} ref={listRef} onScroll={onScroll} aria-live="polite">
        {info && shown.length === 0 && <p className="muted small">{live ? '還沒有留言，來打聲招呼吧 👋' : '沒有留言'}</p>}
        {shown.map((c) => <ChatItem key={c.id} c={c} host={host} onChanged={refresh} />)}
      </div>
      {live && !info.muted && <ChatForm streamId={streamId} host={host} onSent={() => { stick.current = true; return refresh() }} />}
      {live && info.muted && <p className="muted small">你目前無法留言，需要協助請傳 LINE 給我們。</p>}
      {info && !live && <p className="muted small">{info.phase === 'upcoming' ? '直播開放後就能留言。' : '直播已結束，留言僅供觀看。'}</p>}
    </section>
  )
}

function ChatItem({ c, host, onChanged }) {
  const [confirm, setConfirm] = useState(null) // null | hide | mute
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function act(action) {
    setBusy(true)
    setErr('')
    try { await moderate(c.id, action); setConfirm(null); await onChanged() } catch (e) { setErr(chatErrorText(e)) } finally { setBusy(false) }
  }
  return (
    <div className={`chat-item ${c.mine ? 'mine' : ''} ${c.answered ? 'answered' : ''}`}>
      <p className="small chat-meta">
        <b>{c.name}</b>{c.is_host && <span className="pill chat-host">主持人</span>}{c.private && <span className="pill chat-private">只給 James</span>}
        {c.answered && <span className="pill chat-done">已回答</span>}
        <span className="muted">{taipeiTime(new Date(c.created_at))}</span>
      </p>
      <p className="chat-body">{c.body}</p>
      {host && (confirm ? (
        <div className="row confirm-row">
          <span className="small">{confirm === 'hide' ? '刪除這則留言？' : `禁止「${c.name}」留言？之後的直播也會禁止。`}</span>
          <button className="btn ghost" onClick={() => setConfirm(null)}>返回</button>
          <button className="btn danger" disabled={busy} onClick={() => act(confirm)}>確定</button>
        </div>
      ) : (
        <div className="chat-tools">
          {!c.private && <button disabled={busy} onClick={() => act(c.pinned ? 'unpin' : 'pin')}>{c.pinned ? '取消置頂' : '置頂'}</button>}
          {!c.is_host && <button disabled={busy} onClick={() => act(c.answered ? 'unanswer' : 'answer')}>{c.answered ? '改未回答' : '已回答'}</button>}
          <button disabled={busy} onClick={() => setConfirm('hide')}>刪除</button>
          {!c.is_host && (c.muted
            ? <button disabled={busy} onClick={() => act('unmute')}>解除禁言</button>
            : <button disabled={busy} onClick={() => setConfirm('mute')}>禁言</button>)}
        </div>
      ))}
      {err && <p className="error small">{err}</p>}
    </div>
  )
}

function ChatForm({ streamId, host, onSent }) {
  const [body, setBody] = useState('')
  const [isPrivate, setPrivate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function send(e) {
    e.preventDefault()
    if (!body.trim() || busy) return
    setBusy(true)
    setErr('')
    try { await postComment(streamId, body, isPrivate); setBody(''); await onSent() } catch (x) { setErr(chatErrorText(x)) } finally { setBusy(false) }
  }

  return (
    <form className="chat-form" onSubmit={send}>
      <div className="chat-input">
        <input className="search" value={body} maxLength={MAX_BODY} onChange={(e) => setBody(e.target.value)} placeholder={host ? '以主持人身份回覆' : '說點什麼…'} aria-label="留言內容" enterKeyHint="send" />
        <button className="btn primary" disabled={busy || !body.trim()}>{busy ? '…' : '送出'}</button>
      </div>
      {!host && (
        <>
          <label className="small check-row"><input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} />只給 James 看（病史、傷痛等私人問題建議勾選）</label>
          <p className="muted small">{isPrivate ? '其他觀眾看不到這則留言。' : '會顯示你的 LINE 名稱，其他觀眾看得到。'}</p>
        </>
      )}
      {err && <p className="error small">{err}</p>}
    </form>
  )
}
