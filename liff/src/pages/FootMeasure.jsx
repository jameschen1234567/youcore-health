// 足部量測流程：教學 → 左腳 → 右腳 → 報告
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { measureFoot, saveFootMeasurement } from '../lib/api'
import { prepareImage } from '../lib/image'
import { FLAG_NOTES, SIDE_LABELS, footErrorMessage, toCm } from '../lib/foot'
import FootGuide from '../components/FootGuide'

const SIDES = ['left', 'right']

export default function FootMeasure() {
  const navigate = useNavigate()
  const [step, setStep] = useState('guide') // guide | left | right

  if (step === 'guide') {
    return (
      <main className="page">
        <button className="back" onClick={() => navigate('/foot')}>‹ 足部初篩</button>
        <h1>拍照前先看這裡</h1>
        <FootGuide />
        <button className="btn primary block" onClick={() => setStep('left')}>我準備好了，先拍左腳</button>
      </main>
    )
  }

  const idx = SIDES.indexOf(step)
  return (
    <main className="page">
      <button className="back" onClick={() => setStep(idx === 0 ? 'guide' : SIDES[idx - 1])}>‹ 上一步</button>
      <p className="eyebrow">步驟 {idx + 1} / 2</p>
      <SideCapture key={step} side={step}
        onDone={() => (idx === 0 ? setStep('right') : navigate('/foot?new=1'))} />
    </main>
  )
}

function SideCapture({ side, onDone }) {
  const { profile } = useAuth()
  const inputRef = useRef(null)
  const [state, setState] = useState({ phase: 'idle' }) // idle | measuring | result | error | saving
  const label = SIDE_LABELS[side]

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setState({ phase: 'measuring', preview: URL.createObjectURL(file) })
    try {
      const blob = await prepareImage(file)
      const result = await measureFoot(blob, side)
      setState((s) => ({ ...s, phase: 'result', blob, result }))
    } catch (err) {
      setState((s) => ({ ...s, phase: 'error', code: err.code ?? err.message }))
    }
  }

  async function confirm() {
    setState((s) => ({ ...s, phase: 'saving' }))
    try {
      await saveFootMeasurement(profile.id, state.result, state.blob)
      onDone()
    } catch {
      setState((s) => ({ ...s, phase: 'result', saveError: true }))
    }
  }

  const retake = () => inputRef.current?.click()

  return (
    <>
      <h1>拍{label}</h1>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} data-testid={`foot-input-${side}`} />

      {state.preview && <img className="foot-preview" src={state.preview} alt={`${label}照片`} />}

      {state.phase === 'idle' && (
        <>
          <p className="muted">{label}踩在 A4 紙上，請家人從正上方拍一張。</p>
          <button className="btn primary block" onClick={retake}>📷 拍照或選擇照片</button>
        </>
      )}

      {state.phase === 'measuring' && <p className="muted center-text">量測中，大約 5 秒…</p>}

      {state.phase === 'error' && (
        <>
          <p className="banner warn" role="alert">{footErrorMessage(state.code)}</p>
          <button className="btn primary block" onClick={retake}>重拍一張</button>
        </>
      )}

      {(state.phase === 'result' || state.phase === 'saving') && (
        <>
          <section className="card">
            <dl className="scores">
              <div className="main"><dt>足長</dt><dd>{toCm(state.result.length_mm)} cm</dd></div>
              <div><dt>足寬</dt><dd>{toCm(state.result.width_mm)} cm</dd></div>
            </dl>
            {state.result.quality_flags.map((f) => FLAG_NOTES[f] && <p key={f} className="muted small note">⚠️ {FLAG_NOTES[f]}</p>)}
          </section>
          {state.saveError && <p className="error">儲存失敗，請再試一次</p>}
          <div className="row">
            <button className="btn ghost" onClick={retake} disabled={state.phase === 'saving'}>重拍</button>
            <button className="btn primary" onClick={confirm} disabled={state.phase === 'saving'}>
              {state.phase === 'saving' ? '儲存中…' : side === 'left' ? '用這張，下一步拍右腳' : '用這張，看報告'}
            </button>
          </div>
        </>
      )}
    </>
  )
}
