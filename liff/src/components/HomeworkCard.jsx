// 客戶端：回家作業（會員限定）— 每天打勾、里程碑恭喜畫面、達成自動得點
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  STATUS_LABEL, addDays, canCheck, checkIn, homeworkStatus, isMember, listHomework, reachedMilestone, todayTaipei, uncheck,
} from '../lib/homework'
import { MessageButton } from './MessageButton'

const fmt = (d) => d.slice(5).replace('-', '/')

export default function HomeworkCard({ profile }) {
  const member = isMember(profile)
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(null)
  const [celebrate, setCelebrate] = useState(null) // { milestone, points, title }
  const [showDone, setShowDone] = useState(false)

  const reload = useCallback(() => listHomework(profile.id).then(setRows).catch(() => setErr('作業載入失敗')), [profile.id])
  useEffect(() => { if (member) reload() }, [member, reload])

  if (!member) {
    return (
      <section className="card hw-card">
        <h2>回家作業與積分</h2>
        <p className="muted small">教練指派回家作業、每天打勾、達成里程碑拿積分、上排行榜 — 這是會員專屬功能。</p>
        <MessageButton text="我想了解會員" label="傳 LINE 詢問會員" />
      </section>
    )
  }
  if (!rows) return err ? <p className="error small">{err}</p> : null

  const today = todayTaipei()
  const withSt = rows.map((h) => ({ ...h, st: homeworkStatus(h, h.days.length, today) })).filter((h) => h.st !== 'archived')
  const current = withSt.filter((h) => h.st === 'active' || h.st === 'upcoming')
  const done = withSt.filter((h) => h.st === 'done')
  if (current.length === 0 && done.length === 0) {
    return (
      <section className="card hw-card">
        <h2>回家作業</h2>
        <p className="muted small">目前沒有回家作業，上課時教練會幫你安排。</p>
        <Link className="link-btn" to="/points">我的點數與排行榜 ›</Link>
      </section>
    )
  }

  async function toggle(h, day) {
    const checked = h.days.includes(day)
    setBusy(`${h.id}:${day}`); setErr('')
    try {
      if (checked) await uncheck(profile.id, h, day)
      else {
        await checkIn(profile.id, h, day)
        const m = reachedMilestone(h.target_days, h.days.length, h.days.length + 1)
        if (m) setCelebrate({ milestone: m, points: m.key === 'done' ? h.points : 0, title: h.title })
      }
      await reload()
    } catch { setErr(checked ? '取消失敗（已達成的作業不能取消）' : '打勾失敗，請稍後再試') }
    finally { setBusy(null) }
  }

  return (
    <section className="card hw-card">
      <div className="row spread head-row">
        <h2>今天的回家作業</h2>
        <Link className="link-btn" to="/points">點數 ›</Link>
      </div>
      {err && <p className="error small">{err}</p>}
      {current.map((h) => {
        const n = h.days.length
        const pct = Math.min(100, Math.round((n / h.target_days) * 100))
        const yest = addDays(today, -1)
        return (
          <div key={h.id} className="hw-item">
            <div className="row spread">
              <b>{h.title}</b>
              <span className="pill">{h.st === 'upcoming' ? `${fmt(h.starts_on)} 開始` : `+${h.points} 點`}</span>
            </div>
            {h.detail && <p className="small hw-detail">{h.detail}</p>}
            {h.link && <a className="link-btn small" href={h.link} target="_blank" rel="noreferrer">看教學 ›</a>}
            <div className="progress" aria-label={`進度 ${n}／${h.target_days} 天`}><div style={{ width: `${pct}%` }} /></div>
            <p className="muted small">{n}／{h.target_days} 天｜{fmt(h.starts_on)}～{fmt(h.ends_on)}</p>
            {h.st === 'active' && (
              <div className="row hw-actions">
                {canCheck(h, today, today) && (
                  <button className={`btn ${h.days.includes(today) ? 'ghost' : 'primary'}`} disabled={busy != null} onClick={() => toggle(h, today)}>
                    {h.days.includes(today) ? '✅ 今天完成了（點我取消）' : '今天完成 ✅'}
                  </button>
                )}
                {canCheck(h, yest, today) && !h.days.includes(yest) && (
                  <button className="link-btn small" disabled={busy != null} onClick={() => toggle(h, yest)}>補勾昨天</button>
                )}
              </div>
            )}
          </div>
        )
      })}
      {done.length > 0 && (
        <>
          <button className="link-btn" onClick={() => setShowDone(!showDone)}>已達成（{done.length}）{showDone ? '▾' : '▸'}</button>
          {showDone && done.map((h) => (
            <p key={h.id} className="small">🏅 {h.title}｜{h.days.length}／{h.target_days} 天｜{STATUS_LABEL.done} +{h.points} 點</p>
          ))}
        </>
      )}
      {celebrate && <Celebrate data={celebrate} onClose={() => setCelebrate(null)} />}
    </section>
  )
}

function Celebrate({ data, onClose }) {
  const { milestone: m, points, title } = data
  return (
    <div className="celebrate-backdrop" role="dialog" aria-modal="true" aria-label={m.title} onClick={onClose}>
      <div className="celebrate" onClick={(e) => e.stopPropagation()}>
        <div className="confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>
        <p className="celebrate-icon" aria-hidden="true">{m.key === 'done' ? '🏆' : m.key === 'half' ? '🔥' : '🌱'}</p>
        <h2>{m.title}</h2>
        <p className="small">{title}</p>
        <p>{m.text}</p>
        {points > 0 && <p className="celebrate-points">+{points} 點</p>}
        <button className="btn primary block" onClick={onClose}>{m.key === 'done' ? '太棒了！' : '繼續加油'}</button>
      </div>
    </div>
  )
}
