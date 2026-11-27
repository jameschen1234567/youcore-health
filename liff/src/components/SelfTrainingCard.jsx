// 客戶端：自主訓練（會員限定）— 記一筆（類型／時間／RPE，重訓可加組數）、本週統計、近 8 週訓練量
import { useCallback, useEffect, useState } from 'react'
import {
  KINDS, MAX_BACK_DAYS, RPE_HINT, deleteSelfWorkout, listSelfWorkouts, saveSelfWorkout, sessionLoad, todayTaipei,
  validateWorkout, weeklySummary,
} from '../lib/selfTraining'
import { listExercises } from '../lib/training'
import { isMember } from '../lib/homework'
import WeeklyBars from './WeeklyBars'

const fmt = (d) => d.slice(5).replace('-', '/')
const newSet = (from) => ({ weight_kg: from?.weight_kg ?? '', reps: from?.reps ?? '' })
const blank = () => ({ done_on: todayTaipei(), kind: 'run', duration_min: '', rpe: '', note: '', blocks: [] })

export default function SelfTrainingCard({ profile }) {
  const member = isMember(profile)
  const [rows, setRows] = useState(null)
  const [exercises, setExercises] = useState([])
  const [editing, setEditing] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [err, setErr] = useState('')

  const reload = useCallback(() => Promise.all([listSelfWorkouts(profile.id), listExercises()])
    .then(([r, e]) => { setRows(r); setExercises(e) }).catch(() => setErr('自主訓練載入失敗')), [profile.id])
  useEffect(() => { if (member) reload() }, [member, reload])

  if (!member) return null
  const names = Object.fromEntries(exercises.map((e) => [e.id, e.name]))
  const weeks = weeklySummary(rows ?? [])
  const thisWeek = weeks.at(-1)
  const list = [...(rows ?? [])].reverse()
  const shown = showAll ? list : list.slice(0, 5)

  const startEdit = (w) => {
    const blocks = []
    for (const s of w.sets ?? []) {
      let b = blocks.at(-1)
      if (!b || b.exercise_id !== s.exercise_id) { b = { exercise_id: s.exercise_id, sets: [] }; blocks.push(b) }
      b.sets.push(newSet(s))
    }
    setEditing({ id: w.id, done_on: w.done_on, kind: w.kind, duration_min: String(w.duration_min), rpe: String(w.rpe), note: w.note ?? '', blocks })
  }

  return (
    <section className="card">
      <div className="row spread head-row">
        <h2>自主訓練</h2>
        {!editing && <button className="btn primary" onClick={() => setEditing(blank())}>＋ 記一筆</button>}
      </div>
      {err && <p className="error small">{err}</p>}
      {editing && <WorkoutEditor value={editing} onChange={setEditing} exercises={exercises} profileId={profile.id}
        onCancel={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload() }} />}

      {rows && (
        <>
          <p className="stat">
            <span className="big-num">{thisWeek.count}<small> 次</small></span>
            <span className="delta neutral">本週 {thisWeek.minutes} 分鐘｜訓練量 {thisWeek.load}</span>
          </p>
          <WeeklyBars weeks={weeks} />
          <p className="muted small note">訓練量＝時間（分）× 自覺強度 RPE（session-RPE 法）。每週穩定小幅增加比忽高忽低安全。</p>
        </>
      )}
      {rows && rows.length === 0 && !editing && <p className="muted small">還沒有自主訓練紀錄，自己去運動了就記一筆吧！</p>}
      {shown.length > 0 && (
        <ul className="history self-list">
          {shown.map((w) => (
            <li key={w.id}>
              <span>
                <b>{fmt(w.done_on)} {KINDS[w.kind]}</b> {w.duration_min} 分｜RPE {w.rpe}｜量 {sessionLoad(w)}
                {w.sets?.length > 0 && <><br /><span className="muted small">{[...new Set(w.sets.map((s) => names[s.exercise_id] ?? '動作'))].join('、')}｜{w.sets.length} 組</span></>}
                {w.note && <><br /><span className="muted small">{w.note}</span></>}
              </span>
              {!editing && <button className="link-btn small" onClick={() => startEdit(w)}>修改</button>}
            </li>
          ))}
        </ul>
      )}
      {list.length > 5 && <button className="link-btn" onClick={() => setShowAll(!showAll)}>{showAll ? '收起' : `看全部（${list.length}）`}</button>}
    </section>
  )
}

function WorkoutEditor({ value: v, onChange, exercises, profileId, onCancel, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState(false)
  const set = (k) => (e) => onChange({ ...v, [k]: e.target.value })
  const updBlock = (i, fn) => onChange({ ...v, blocks: v.blocks.map((b, j) => (j === i ? fn(b) : b)) })
  const today = todayTaipei()
  const minDay = new Date(Date.parse(`${today}T00:00:00Z`) - MAX_BACK_DAYS * 864e5).toISOString().slice(0, 10)

  async function save() {
    const sets = v.kind === 'strength' ? v.blocks.flatMap((b) => b.sets.map((s) => ({ exercise_id: b.exercise_id, ...s }))) : []
    const e = validateWorkout({ ...v, sets })
    if (e) return setErr(e)
    setBusy(true); setErr('')
    try { await saveSelfWorkout(profileId, { ...v, sets }); await onSaved() }
    catch { setErr('儲存失敗，請稍後再試'); setBusy(false) }
  }

  return (
    <div className="session-editor">
      <div className="form-grid two-col">
        <label className="small">日期<input className="search" type="date" value={v.done_on} min={minDay} max={today} onChange={set('done_on')} /></label>
        <label className="small">類型
          <select className="search" value={v.kind} onChange={set('kind')}>
            {Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="small">時間（分鐘）<input className="search" type="number" inputMode="numeric" min="1" max="600" value={v.duration_min} onChange={set('duration_min')} placeholder="例如 40" /></label>
        <label className="small">自覺強度 RPE
          <select className="search" value={v.rpe} onChange={set('rpe')}>
            <option value="">選擇…</option>
            {Object.entries(RPE_HINT).map(([k, l]) => <option key={k} value={k}>{k}｜{l}</option>)}
          </select>
        </label>
      </div>
      {v.kind === 'strength' && (
        <div>
          {v.blocks.map((b, i) => (
            <div key={i} className="ex-block">
              <div className="row spread">
                <select aria-label="選擇動作" value={b.exercise_id} onChange={(e) => updBlock(i, (x) => ({ ...x, exercise_id: e.target.value }))}>
                  <option value="">選擇動作…</option>
                  {exercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <button className="link-btn danger-text" onClick={() => onChange({ ...v, blocks: v.blocks.filter((_, j) => j !== i) })}>移除</button>
              </div>
              <table className="sets-table edit">
                <thead><tr><th>組</th><th>重量 kg</th><th>次數</th><th></th></tr></thead>
                <tbody>
                  {b.sets.map((s, si) => {
                    const f = (k) => (e) => updBlock(i, (x) => ({ ...x, sets: x.sets.map((y, j) => (j === si ? { ...y, [k]: e.target.value } : y)) }))
                    return (
                      <tr key={si}>
                        <td>{si + 1}</td>
                        <td><input aria-label={`第 ${si + 1} 組重量`} type="number" inputMode="decimal" step="0.5" min="0" value={s.weight_kg} onChange={f('weight_kg')} /></td>
                        <td><input aria-label={`第 ${si + 1} 組次數`} type="number" inputMode="numeric" min="1" max="100" value={s.reps} onChange={f('reps')} /></td>
                        <td>{b.sets.length > 1 && <button className="link-btn danger-text" aria-label={`刪除第 ${si + 1} 組`} onClick={() => updBlock(i, (x) => ({ ...x, sets: x.sets.filter((_, j) => j !== si) }))}>✕</button>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <button className="link-btn" onClick={() => updBlock(i, (x) => ({ ...x, sets: [...x.sets, newSet(x.sets.at(-1))] }))}>＋ 加一組</button>
            </div>
          ))}
          <button className="btn ghost block" onClick={() => onChange({ ...v, blocks: [...v.blocks, { exercise_id: '', sets: [newSet()] }] })}>＋ 加動作（選填）</button>
          <p className="muted small">自己記的組數不會算進教練的最大肌力推估。</p>
        </div>
      )}
      <label className="small">備註（選填）<input className="search" value={v.note} maxLength={200} onChange={set('note')} placeholder="例如：河濱跑 5 公里、膝蓋有點緊" /></label>
      {err && <p className="error small">{err}</p>}
      {confirm ? (
        <div className="row confirm-row">
          <span className="small">刪除這筆自主訓練？</span>
          <button className="btn ghost" disabled={busy} onClick={() => setConfirm(false)}>取消</button>
          <button className="btn danger" disabled={busy} onClick={async () => { setBusy(true); try { await deleteSelfWorkout(profileId, v.id); await onSaved() } catch { setErr('刪除失敗'); setBusy(false) } }}>確定刪除</button>
        </div>
      ) : (
        <div className="row">
          {v.id && <button className="btn ghost" disabled={busy} onClick={() => setConfirm(true)}>刪除</button>}
          <button className="btn ghost" disabled={busy} onClick={onCancel}>取消</button>
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? '儲存中…' : '儲存'}</button>
        </div>
      )}
    </div>
  )
}
