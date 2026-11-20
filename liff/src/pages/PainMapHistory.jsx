// 疼痛地圖紀錄：最近一次的地圖＋與上次比較
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { listPainMaps } from '../lib/api'
import { useAuth } from '../auth/AuthProvider'
import BodyMap from '../components/BodyMap'
import { REGION_LABELS } from '../lib/bodyRegions'
import { fmtDate } from '../lib/format'

export default function PainMapHistory() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(false)
  const [view, setView] = useState('front')

  useEffect(() => {
    listPainMaps(profile.id).then(setRows).catch(() => setError(true))
  }, [profile.id])

  const last = rows?.at(-1)
  const prev = rows?.at(-2)
  const keys = last ? [...new Set([...Object.keys(last.regions), ...Object.keys(prev?.regions ?? {})])] : []
  keys.sort((a, b) => (last.regions[b] ?? 0) - (last.regions[a] ?? 0))

  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/scales')}>‹ 量表</button>
      <h1>身體疼痛地圖</h1>
      {params.get('new') && <p className="banner ok">✓ 已送出，謝謝你！</p>}
      {error && <p className="error">紀錄載入失敗，請稍後再試</p>}
      {rows && rows.length === 0 && <p className="muted">還沒有紀錄</p>}

      {last && (
        <>
          <p className="muted small">最近一次｜{fmtDate(last.submitted_at)}{prev && `（與 ${fmtDate(prev.submitted_at)} 比較）`}</p>
          <div className="segmented two" role="tablist">
            {[['front', '正面'], ['back', '背面']].map(([k, label]) => (
              <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{label}</button>
            ))}
          </div>
          <BodyMap view={view} values={last.regions} selected={null} onSelect={() => {}} />
          <section className="card">
            {keys.length === 0 ? <p>這次沒有標記疼痛部位 🎉</p> : (
              <ul className="marked">
                {keys.map((k) => {
                  const now = last.regions[k] ?? 0
                  const before = prev?.regions?.[k]
                  const diff = before != null ? now - before : null
                  return (
                    <li key={k}>
                      <span>{REGION_LABELS[k] ?? k}</span>
                      <span>
                        <b>{now || '—'}</b>
                        {diff != null && diff !== 0 && <span className={`delta ${diff < 0 ? 'good' : 'bad'}`}>{diff > 0 ? '▲' : '▼'} {Math.abs(diff)}</span>}
                        {before == null && prev && <span className="delta">新</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <Link className="btn primary block" to="/scales/painmap">再填一次</Link>
    </main>
  )
}
