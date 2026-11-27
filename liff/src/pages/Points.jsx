// 客戶端：我的點數、點數紀錄、會員積分排行榜（會員限定）
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { isMember, leaderboard, listPoints, pointsBalance } from '../lib/homework'
import { MessageButton } from '../components/MessageButton'

const fmtTs = (iso) => new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(iso))

export default function Points() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const member = isMember(profile)
  const [rows, setRows] = useState(null)
  const [period, setPeriod] = useState('month')
  const [board, setBoard] = useState(null)
  const [err, setErr] = useState(false)

  useEffect(() => { if (member) listPoints(profile.id).then(setRows).catch(() => setErr(true)) }, [member, profile.id])
  useEffect(() => {
    if (!member) return
    setBoard(null)
    leaderboard(period, profile).then(setBoard).catch(() => setBoard([]))
  }, [member, period, profile])

  return (
    <main className="page">
      <button className="back" onClick={() => navigate(-1)}>‹ 返回</button>
      <h1>點數與排行榜</h1>
      {!member ? (
        <section className="card">
          <p>完成教練指派的回家作業就能拿點數、上排行榜，這是會員專屬功能。</p>
          <MessageButton text="我想了解會員" label="傳 LINE 詢問會員" />
        </section>
      ) : (
        <>
          {err && <p className="error">載入失敗，請稍後再試</p>}
          <section className="card">
            <p className="muted small">目前點數</p>
            <p className="stat"><span className="big-num">{rows ? pointsBalance(rows) : '…'}<small> 點</small></span></p>
            <details className="toggle">
              <summary className="small">點數可以做什麼？</summary>
              <ul className="small">
                <li>想學的主題可以優先安排</li>
                <li>教練為你寫專屬文章</li>
                <li>上會員積分排行榜，接受小表揚</li>
              </ul>
              <p className="muted small">兌換方式請直接傳 LINE 或上課時跟教練說，由教練幫你扣點。</p>
            </details>
          </section>

          <section className="card">
            <h2>會員積分排行榜</h2>
            <div className="chips">
              {[['month', '本月'], ['all', '累計']].map(([k, l]) => (
                <button key={k} className={`chip ${period === k ? 'on' : ''}`} onClick={() => setPeriod(k)}>{l}</button>
              ))}
            </div>
            {!board && <p className="muted small">載入中…</p>}
            {board && board.length === 0 && <p className="muted small">{period === 'month' ? '這個月還沒有人拿到點數，搶頭香！' : '還沒有人拿到點數'}</p>}
            {board && board.length > 0 && (
              <ol className="board">
                {board.map((r, i) => (
                  <li key={i} className={r.is_me ? 'me' : ''}>
                    <span className="board-rank">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
                    <span className="board-name">{r.name}{r.is_me && '（你）'}</span>
                    <b>{r.points}</b>
                  </li>
                ))}
              </ol>
            )}
            <p className="muted small">依獲得的點數排名（兌換扣點不影響名次），名字只顯示頭尾字。</p>
          </section>

          <section className="card">
            <h2>點數紀錄</h2>
            {rows && rows.length === 0 && <p className="muted small">還沒有點數紀錄，完成回家作業就能拿點數。</p>}
            <ul className="history">
              {(rows ?? []).map((r) => (
                <li key={r.id}><span>{r.reason}<br /><span className="muted small">{fmtTs(r.created_at)}</span></span>
                  <b className={r.amount > 0 ? 'good-text' : 'danger-text'}>{r.amount > 0 ? '+' : ''}{r.amount}</b></li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  )
}
