// 量表填寫：一次一題，選完自動跳下一題，最後一頁確認送出
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { QUESTIONNAIRES, visibleQuestionnaires } from '../questionnaires'
import { scoreQuestionnaire } from '../lib/scoring'
import { saveResponse } from '../lib/api'
import { useAuth } from '../auth/AuthProvider'
import NumberScale from '../components/NumberScale'

export default function QuestionnaireForm() {
  const { key } = useParams()
  const config = visibleQuestionnaires().includes(QUESTIONNAIRES[key]) ? QUESTIONNAIRES[key] : null
  if (!config) return <main className="page"><p className="muted">找不到這份量表</p></main>
  return <Form config={config} />
}

function Form({ config }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(-1) // -1 = 說明頁；items.length = 確認頁
  const [answers, setAnswers] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const items = config.items
  const total = items.length
  const answeredCount = Object.keys(answers).length

  const answer = (id, v) => {
    setAnswers((a) => ({ ...a, [id]: v }))
    setTimeout(() => setStep((s) => Math.min(s + 1, total)), 180) // 讓使用者看到選取效果再跳題
  }

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const result = scoreQuestionnaire(config, answers)
      await saveResponse(profile.id, config, answers, result)
      navigate(`/scales/${config.key}/history?new=1`, { replace: true })
    } catch {
      setError('送出失敗，請稍後再試')
      setSaving(false)
    }
  }

  if (step === -1) {
    return (
      <main className="page">
        <button className="back" onClick={() => navigate('/scales')}>‹ 返回</button>
        {config.placeholder && <PlaceholderBanner />}
        <h1>{config.title}</h1>
        <section className="card"><p>{config.intro}</p></section>
        <p className="muted small">共 {total} 題，約 {Math.max(1, Math.round(total * 0.15))} 分鐘</p>
        <button className="btn primary block" onClick={() => setStep(0)}>開始填寫</button>
      </main>
    )
  }

  if (step === total) {
    const unanswered = items.filter((it) => !(it.id in answers))
    return (
      <main className="page">
        <Progress value={total} total={total} />
        <h1>確認送出</h1>
        <section className="card">
          <p>已作答 {answeredCount} / {total} 題。</p>
          {unanswered.length > 0 && (
            <>
              <p className="muted small">還有 {unanswered.length} 題沒有作答，題數太少的部分可能無法計分。</p>
              <button className="btn ghost block" onClick={() => setStep(items.indexOf(unanswered[0]))}>回去補答</button>
            </>
          )}
        </section>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="btn ghost" onClick={() => setStep(total - 1)}>上一題</button>
          <button className="btn primary" disabled={saving || answeredCount === 0} onClick={submit}>
            {saving ? '送出中…' : '送出'}
          </button>
        </div>
      </main>
    )
  }

  const item = items[step]
  const sub = config.subscales.find((s) => s.key === item.subscale)
  return (
    <main className="page">
      <Progress value={step} total={total} />
      <p className="eyebrow">{sub ? `${sub.label}・` : ''}第 {step + 1} / {total} 題</p>
      <h1 className="question">{item.text}</h1>
      <NumberScale scale={{ ...config.scale, ...(item.scale ?? {}) }} value={answers[item.id]} onChange={(v) => answer(item.id, v)} />
      <div className="row spread">
        <button className="btn ghost" onClick={() => setStep(step - 1)}>{step === 0 ? '說明' : '上一題'}</button>
        <button className="btn ghost" onClick={() => setStep(step + 1)}>{item.id in answers ? '下一題' : '略過'}</button>
      </div>
    </main>
  )
}

function Progress({ value, total }) {
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
      <div style={{ width: `${(value / total) * 100}%` }} />
    </div>
  )
}

export function PlaceholderBanner() {
  return <p className="banner">⚠ 佔位題目：僅供 Demo 預覽流程，正式題目取得授權後替換</p>
}
