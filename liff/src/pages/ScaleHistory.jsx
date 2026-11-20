// 量表歷史：趨勢圖＋與上次比較＋逐次紀錄
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { QUESTIONNAIRES } from '../questionnaires'
import { listResponses } from '../lib/api'
import { useAuth } from '../auth/AuthProvider'
import LineChart from '../components/LineChart'
import { fmtDate } from '../lib/format'
import { PlaceholderBanner } from './QuestionnaireForm'

const COLORS = ['#4A6741', '#C9A96E', '#B3412E', '#5B7FA6']

export default function ScaleHistory() {
  const { key } = useParams()
  const config = QUESTIONNAIRES[key]
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (config) listResponses(profile.id, key).then(setRows).catch(() => setError(true))
  }, [config, key, profile.id])

  if (!config) return <main className="page"><p className="muted">找不到這份量表</p></main>

  const single = config.scoring.method === 'single'
  const yMax = single ? config.scale.max : 100
  const series = single
    ? [{ key: 'total', label: '分數', color: COLORS[0], points: (rows ?? []).map(toPoint('total')) }]
    : [
      { key: 'total', label: '總分', color: COLORS[0], points: (rows ?? []).map(toPoint('total')) },
      ...config.subscales.map((s, i) => ({ key: s.key, label: s.label, color: COLORS[i + 1], points: (rows ?? []).map(toPoint(s.key)) })),
    ]

  const last = rows?.at(-1)
  const prev = rows?.at(-2)

  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/scales')}>‹ 量表</button>
      {config.placeholder && <PlaceholderBanner />}
      <h1>{config.title}</h1>
      {params.get('new') && <p className="banner ok">✓ 已送出，謝謝你！</p>}
      {error && <p className="error">紀錄載入失敗，請稍後再試</p>}
      {rows && rows.length === 0 && <p className="muted">還沒有紀錄</p>}

      {last && (
        <section className="card">
          <p className="muted small">最近一次｜{fmtDate(last.submitted_at)}</p>
          <ScoreRows config={config} scores={last.scores} prev={prev?.scores} />
          <p className="muted small note">
            {config.higherIsWorse ? '分數越高，代表疼痛或功能受限越明顯；分數下降代表改善。' : ''}
            這是自我評估的追蹤工具，不是醫療診斷。
          </p>
        </section>
      )}

      {rows && rows.length > 0 && (
        <section className="card">
          <h2>趨勢</h2>
          <LineChart series={series} yMax={yMax} />
        </section>
      )}

      {rows && rows.length > 0 && (
        <section className="card">
          <h2>所有紀錄</h2>
          <ul className="history">
            {[...rows].reverse().map((r) => (
              <li key={r.id}>
                <span>{fmtDate(r.submitted_at)}</span>
                <b>{r.scores?.total?.score ?? '無法計分'}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link className="btn primary block" to={`/scales/${key}`}>再填一次</Link>
    </main>
  )
}

const toPoint = (k) => (r) => ({
  x: new Date(r.submitted_at),
  y: k === 'total' ? r.scores?.total?.score ?? null : r.scores?.subscales?.[k]?.score ?? null,
})

function ScoreRows({ config, scores, prev }) {
  const rows = [
    { key: 'total', label: config.scoring.method === 'single' ? '分數' : '總分', now: scores?.total, before: prev?.total },
    ...config.subscales.map((s) => ({ key: s.key, label: s.label, now: scores?.subscales?.[s.key], before: prev?.subscales?.[s.key] })),
  ]
  return (
    <dl className="scores">
      {rows.map((r) => {
        const diff = r.now?.score != null && r.before?.score != null ? Math.round((r.now.score - r.before.score) * 10) / 10 : null
        const better = diff != null && (config.higherIsWorse ? diff < 0 : diff > 0)
        return (
          <div key={r.key} className={r.key === 'total' ? 'main' : ''}>
            <dt>{r.label}</dt>
            <dd>
              {r.now?.computable ? r.now.score : <span className="muted small">無法計分（作答題數不足）</span>}
              {diff != null && diff !== 0 && (
                <span className={`delta ${better ? 'good' : 'bad'}`}>{diff > 0 ? '▲' : '▼'} {Math.abs(diff)}</span>
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
