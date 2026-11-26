// 互動模擬教室：免費試玩單元登入可開；其他單元在使用期限內可開（買課自動 3 個月）
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { byCategory, canLearn, canOpen, listModules, loadModuleHtml } from '../lib/learning'
import { fmtDay } from '../lib/training'
import { MessageButton } from '../components/MessageButton'

export default function Learn() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [d, setD] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    Promise.all([listModules(), canLearn(profile.id, profile.role)]).then(([mods, access]) => setD({ mods, access })).catch(() => setErr(true))
  }, [profile.id, profile.role])
  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/me')}>‹ 我的</button>
      <h1>互動模擬教室</h1>
      <p className="muted small">動手拉拉看，了解關節、肌肉與動作的關係。</p>
      {err && <p className="error">載入失敗，請稍後再試</p>}
      {!d && !err && <p className="muted">載入中…</p>}
      {d?.access.active && d.access.until && <p className="banner ok">使用期限：{fmtDay(d.access.until)}</p>}
      {d && !d.access.active && (
        <section className="card">
          <p>先試試標示「免費試玩」的單元！{d.access.startsLater ? `你的使用期限從 ${fmtDay(d.access.startsLater)} 開始。` : '購買課程的客人會自動開通 3 個月，可以使用全部單元。'}</p>
          <MessageButton text="我想了解互動模擬教室" />
        </section>
      )}
      {byCategory(d?.mods ?? []).map((g) => (
        <section key={g.key}>
          <h2 className="section-title">{g.label}</h2>
          {g.mods.map((m) => {
            const open = canOpen(d.access, m)
            return (
              <div key={m.id} className={`card ${open ? '' : 'locked'}`}>
                <div className="row spread"><b>{m.title}</b>{m.free && !d.access.active && <span className="pill">免費試玩</span>}{!open && <span className="pill">🔒 購課開通</span>}{!m.published && <span className="pill">未公開</span>}</div>
                {m.summary && <p className="muted small">{m.summary}</p>}
                {open && <Link className="btn primary block" to={`/learn/${m.id}`}>開始操作</Link>}
              </div>
            )
          })}
        </section>
      ))}
    </main>
  )
}

export function LearnView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [m, setM] = useState(null)
  const [html, setHtml] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    listModules().then(async (mods) => {
      const mod = mods.find((x) => x.id === id)
      if (!mod) throw new Error('NOT_FOUND')
      const h = await loadModuleHtml(mod.path)
      if (alive) { setM(mod); setHtml(h) }
    }).catch(() => alive && setErr('目前無法開啟。可能是使用期限已到，或網路不穩。'))
    return () => { alive = false }
  }, [id])
  return (
    <main className="page learn-view">
      <button className="back" onClick={() => navigate('/learn')}>‹ 互動模擬教室</button>
      {err && <section className="card"><p>{err}</p><MessageButton text="我想詢問互動模擬教室的使用期限" /></section>}
      {!html && !err && <p className="muted">載入中…</p>}
      {/* 沙盒：教材程式碼碰不到 App 的登入資料 */}
      {html && <iframe title={m.title} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" srcDoc={html} />}
    </main>
  )
}
