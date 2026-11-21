// 後台：訓練紀錄（一次訓練 → 多個動作 → 每組重量／次數／RPE）
import { useCallback, useEffect, useState } from 'react'
import {
  adminAddExercise, adminDeleteSession, adminSaveSession, groupSets, listExercises, listTrainingSessions, todayTaipei,
} from '../../lib/training'
import { estimate1RM } from '../../lib/strength'
import SessionSets from '../../components/SessionSets'

const RPE_OPTIONS = ['', 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]
const CATEGORY_LABELS = { lower: '下肢', hinge: '髖主導', push: '推', pull: '拉', other: '自訂' }
const newSet = (from) => ({ weight_kg: from?.weight_kg ?? '', reps: from?.reps ?? '', rpe: from?.rpe ?? '' })
let keySeq = 0
const newBlock = (exercise_id = '', sets = [newSet()]) => ({ key: ++keySeq, exercise_id, sets })

export default function AdminTraining({ profileId }) {
  const [sessions, setSessions] = useState(null)
  const [exercises, setExercises] = useState([])
  const [editing, setEditing] = useState(null) // null | { id?, session_date, note, blocks }
  const [openId, setOpenId] = useState(null)
  const [err, setErr] = useState('')

  const reload = useCallback(() => Promise.all([listTrainingSessions(profileId), listExercises()])
    .then(([s, e]) => { setSessions(s); setExercises(e) })
    .catch(() => setErr('載入失敗')), [profileId])
  useEffect(() => { reload() }, [reload])

  const startNew = () => setEditing({ session_date: todayTaipei(), note: '', blocks: [newBlock()] })
  const startEdit = (s) => setEditing({
    id: s.id, session_date: s.session_date, note: s.note ?? '',
    blocks: groupSets(s.sets).map((g) => newBlock(g.exercise_id, g.sets.map((x) => newSet({ ...x, rpe: x.rpe ?? '' })))),
  })

  return (
    <section className="card">
      <div className="row spread head-row">
        <h2>訓練紀錄（{sessions?.length ?? '…'} 次）</h2>
        {!editing && <button className="btn primary" onClick={startNew}>＋ 新增訓練</button>}
      </div>
      {err && <p className="error small">{err}</p>}

      {editing && (
        <SessionEditor value={editing} exercises={exercises} onChange={setEditing}
          onExerciseAdded={(ex) => setExercises((list) => [...list, ex])}
          onCancel={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload() }}
          profileId={profileId} />
      )}

      {sessions && sessions.length === 0 && !editing && <p className="muted">還沒有訓練紀錄</p>}
      {sessions && !editing && (
        <ul className="session-list">
          {[...sessions].reverse().map((s) => (
            <SessionItem key={s.id} s={s} exercises={exercises} open={openId === s.id}
              onToggle={() => setOpenId(openId === s.id ? null : s.id)}
              onEdit={() => startEdit(s)}
              onDelete={async () => { await adminDeleteSession(profileId, s.id); await reload() }} />
          ))}
        </ul>
      )}
    </section>
  )
}

function SessionItem({ s, exercises, open, onToggle, onEdit, onDelete }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const names = Object.fromEntries(exercises.map((e) => [e.id, e.name]))
  const exIds = [...new Set(s.sets.map((x) => x.exercise_id))]
  return (
    <li>
      <button className="session-head" onClick={onToggle} aria-expanded={open}>
        <span><b>{s.session_date.replaceAll('-', '/')}</b>
          <span className="muted small">{exIds.map((id) => names[id] ?? '動作').join('、') || '沒有動作'}｜{s.sets.length} 組</span>
        </span>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="session-body">
          {s.note && <p className="muted small">備註：{s.note}</p>}
          <SessionSets groups={groupSets(s.sets)} exercises={exercises} />
          {confirm ? (
            <div className="row confirm-row">
              <span className="small">確定刪除這次訓練？所有組數會一起刪除，無法復原。</span>
              <button className="btn ghost" disabled={busy} onClick={() => setConfirm(false)}>取消</button>
              <button className="btn danger" disabled={busy} onClick={async () => { setBusy(true); try { await onDelete() } finally { setBusy(false) } }}>
                {busy ? '刪除中…' : '確定刪除'}
              </button>
            </div>
          ) : (
            <div className="row">
              <button className="btn ghost" onClick={() => setConfirm(true)}>刪除</button>
              <button className="btn primary" onClick={onEdit}>修改</button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function SessionEditor({ value, exercises, onChange, onExerciseAdded, onCancel, onSaved, profileId }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const upd = (fn) => onChange({ ...value, blocks: fn(value.blocks) })
  const updBlock = (key, fn) => upd((bs) => bs.map((b) => (b.key === key ? fn(b) : b)))

  async function save() {
    if (!value.session_date) return setErr('請填訓練日期')
    const sets = value.blocks.flatMap((b) => b.sets.map((s) => ({ exercise_id: b.exercise_id, ...s })))
    const bad = sets.find((s) => s.exercise_id && (s.weight_kg !== '' || s.reps !== '') && (s.weight_kg === '' || s.reps === '' || Number(s.reps) <= 0 || Number(s.weight_kg) < 0))
    if (bad) return setErr('有一組的重量或次數沒填完整')
    if (!sets.some((s) => s.exercise_id && s.weight_kg !== '' && s.reps !== '')) return setErr('至少記錄一組')
    setBusy(true)
    setErr('')
    try {
      await adminSaveSession(profileId, { id: value.id, session_date: value.session_date, note: value.note, sets })
      await onSaved()
    } catch {
      setErr('儲存失敗，請稍後再試')
      setBusy(false)
    }
  }

  return (
    <div className="session-editor">
      <div className="form-grid two-col">
        <label className="small">訓練日期<input className="search" type="date" value={value.session_date} onChange={(e) => onChange({ ...value, session_date: e.target.value })} /></label>
        <label className="small">備註<input className="search" value={value.note} maxLength={200} onChange={(e) => onChange({ ...value, note: e.target.value })} placeholder="選填" /></label>
      </div>

      {value.blocks.map((b) => (
        <div key={b.key} className="ex-block">
          <div className="row spread">
            <ExercisePicker value={b.exercise_id} exercises={exercises} onAdded={onExerciseAdded}
              onChange={(id) => updBlock(b.key, (x) => ({ ...x, exercise_id: id }))} />
            {value.blocks.length > 1 && (
              <button className="link-btn danger-text" onClick={() => upd((bs) => bs.filter((x) => x.key !== b.key))}>移除動作</button>
            )}
          </div>
          <table className="sets-table edit">
            <thead><tr><th>組</th><th>重量 kg</th><th>次數</th><th>RPE</th><th>推估</th><th></th></tr></thead>
            <tbody>
              {b.sets.map((s, si) => {
                const setField = (k) => (e) => updBlock(b.key, (x) => ({ ...x, sets: x.sets.map((y, j) => (j === si ? { ...y, [k]: e.target.value } : y)) }))
                const e1 = s.weight_kg !== '' && s.reps !== '' ? estimate1RM(s) : null
                return (
                  <tr key={si}>
                    <td>{si + 1}</td>
                    <td><input aria-label={`第 ${si + 1} 組重量`} type="number" inputMode="decimal" step="0.5" min="0" value={s.weight_kg} onChange={setField('weight_kg')} /></td>
                    <td><input aria-label={`第 ${si + 1} 組次數`} type="number" inputMode="numeric" step="1" min="1" value={s.reps} onChange={setField('reps')} /></td>
                    <td>
                      <select aria-label={`第 ${si + 1} 組 RPE`} value={s.rpe} onChange={setField('rpe')}>
                        {RPE_OPTIONS.map((r) => <option key={r} value={r}>{r === '' ? '—' : r}</option>)}
                      </select>
                    </td>
                    <td className="muted small">{e1 ?? '—'}</td>
                    <td>{b.sets.length > 1 && (
                      <button className="link-btn danger-text" aria-label={`刪除第 ${si + 1} 組`}
                        onClick={() => updBlock(b.key, (x) => ({ ...x, sets: x.sets.filter((_, j) => j !== si) }))}>✕</button>
                    )}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <button className="link-btn" onClick={() => updBlock(b.key, (x) => ({ ...x, sets: [...x.sets, newSet(x.sets.at(-1))] }))}>
            ＋ 加一組（複製上一組）
          </button>
        </div>
      ))}

      <button className="btn ghost block" onClick={() => upd((bs) => [...bs, newBlock()])}>＋ 加動作</button>
      <p className="muted small">RPE 6～10：10 = 做到力竭、9 = 還能再做 1 下、8 = 還能 2 下。推估欄為該組推估 1RM（kg）。</p>
      {err && <p className="error small">{err}</p>}
      <div className="row">
        <button className="btn ghost" onClick={onCancel} disabled={busy}>取消</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? '儲存中…' : value.id ? '儲存修改' : '儲存訓練'}</button>
      </div>
    </div>
  )
}

function ExercisePicker({ value, exercises, onChange, onAdded }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const groups = {}
  for (const e of exercises) (groups[e.is_custom ? 'other' : e.category] ??= []).push(e)

  if (adding) {
    return (
      <span className="row picker-add">
        <input className="search" autoFocus value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="自訂動作名稱" aria-label="自訂動作名稱" />
        <button className="btn ghost" onClick={() => { setAdding(false); setName('') }} disabled={busy}>取消</button>
        <button className="btn primary" disabled={busy || !name.trim()} onClick={async () => {
          setBusy(true)
          try {
            const ex = await adminAddExercise(name)
            if (!exercises.some((e) => e.id === ex.id)) onAdded(ex)
            onChange(ex.id)
            setAdding(false)
            setName('')
          } finally { setBusy(false) }
        }}>加入</button>
      </span>
    )
  }
  return (
    <select aria-label="選擇動作" value={value} onChange={(e) => (e.target.value === '__new' ? setAdding(true) : onChange(e.target.value))}>
      <option value="">選擇動作…</option>
      {Object.entries(CATEGORY_LABELS).map(([cat, label]) => groups[cat]?.length ? (
        <optgroup key={cat} label={label}>
          {groups[cat].map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </optgroup>
      ) : null)}
      <option value="__new">＋ 新增自訂動作…</option>
    </select>
  )
}
