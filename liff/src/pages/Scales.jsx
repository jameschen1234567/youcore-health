// 量表首頁：每份量表顯示最近一次分數與日期，超過回測天數會提醒
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { visibleQuestionnaires } from '../questionnaires'
import { listPainMaps, listResponses } from '../lib/api'
import { retestDue } from '../lib/scoring'
import { useAuth } from '../auth/AuthProvider'
import { fmtDate } from '../lib/format'

export default function Scales() {
  const { profile } = useAuth()
  const qs = visibleQuestionnaires()
  const [latest, setLatest] = useState({})
  const [error, setError] = useState(false)

  useEffect(() => {
    Promise.all([
      ...qs.map((q) => listResponses(profile.id, q.key).then((rows) => [q.key, rows.at(-1)])),
      listPainMaps(profile.id).then((rows) => ['painmap', rows.at(-1)]),
    ])
      .then((pairs) => setLatest(Object.fromEntries(pairs)))
      .catch(() => setError(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  return (
    <main className="page">
      <h1>評估量表</h1>
      <p className="muted">定期填寫，就能看到自己的變化。建議每 4–6 週回測一次。</p>
      {error && <p className="error">紀錄載入失敗，請稍後再試</p>}

      {qs.map((q) => {
        const last = latest[q.key]
        const score = last?.scores?.total?.score
        return (
          <ScaleCard key={q.key} title={q.title} placeholder={q.placeholder}
            last={last} due={retestDue(last?.submitted_at, new Date(), q.retestDays)}
            summary={last ? (score != null ? `${score}${q.scoring.method === 'single' ? ' 分' : ''}` : '無法計分') : null}
            fill={`/scales/${q.key}`} history={`/scales/${q.key}/history`} />
        )
      })}

      <ScaleCard title="身體疼痛地圖" last={latest.painmap}
        due={retestDue(latest.painmap?.submitted_at)}
        summary={latest.painmap ? `${Object.keys(latest.painmap.regions).length} 個部位` : null}
        fill="/scales/painmap" history="/scales/painmap/history" />
    </main>
  )
}

function ScaleCard({ title, placeholder, last, due, summary, fill, history }) {
  return (
    <section className="card scale-card">
      <div className="scale-card-head">
        <h2>{title}</h2>
        {due && <span className="tag">該回測了</span>}
        {placeholder && <span className="tag warn">佔位</span>}
      </div>
      {last
        ? <p className="muted small">上次：{fmtDate(last.submitted_at)}｜{summary}</p>
        : <p className="muted small">還沒填寫過</p>}
      <div className="row">
        {last && <Link className="btn ghost" to={history}>看紀錄</Link>}
        <Link className="btn primary" to={fill}>{last ? '再填一次' : '開始填寫'}</Link>
      </div>
    </section>
  )
}
