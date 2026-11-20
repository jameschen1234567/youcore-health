// 身體疼痛地圖：點選部位 → 給 0–10 分（0 = 取消）→ 送出
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BodyMap from '../components/BodyMap'
import NumberScale from '../components/NumberScale'
import { REGION_LABELS } from '../lib/bodyRegions'
import { savePainMap } from '../lib/api'
import { useAuth } from '../auth/AuthProvider'

const SCALE = { min: 0, max: 10, minLabel: '不痛（取消）', maxLabel: '最痛' }

export default function PainMapForm() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [view, setView] = useState('front')
  const [values, setValues] = useState({})
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const setValue = (v) => {
    setValues((prev) => {
      const next = { ...prev }
      if (v === 0) delete next[selected]
      else next[selected] = v
      return next
    })
    setSelected(null)
  }

  const marked = Object.entries(values).sort((a, b) => b[1] - a[1])

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      await savePainMap(profile.id, values)
      navigate('/scales/painmap/history?new=1', { replace: true })
    } catch {
      setError('送出失敗，請稍後再試')
      setSaving(false)
    }
  }

  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/scales')}>‹ 返回</button>
      <h1>身體疼痛地圖</h1>
      <p className="muted">點選會痛的部位，給它 1–10 分。正面、背面都可以標。</p>

      <div className="segmented two" role="tablist">
        {[['front', '正面'], ['back', '背面']].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''}
            onClick={() => { setView(k); setSelected(null) }}>{label}</button>
        ))}
      </div>

      <BodyMap view={view} values={values} selected={selected} onSelect={setSelected} />

      {selected && (
        <section className="card sheet">
          <h2>{REGION_LABELS[selected]}</h2>
          <NumberScale scale={SCALE} value={values[selected] ?? 0} onChange={setValue} />
        </section>
      )}

      <section className="card">
        <h2>已標記 {marked.length} 個部位</h2>
        {marked.length === 0
          ? <p className="muted small">還沒有標記。沒有任何疼痛也可以直接送出。</p>
          : (
            <ul className="marked">
              {marked.map(([k, v]) => (
                <li key={k}><button onClick={() => setSelected(k)}>{REGION_LABELS[k]}</button><b>{v}</b></li>
              ))}
            </ul>
          )}
      </section>

      {error && <p className="error">{error}</p>}
      <button className="btn primary block" disabled={saving} onClick={submit}>{saving ? '送出中…' : '送出'}</button>
    </main>
  )
}
