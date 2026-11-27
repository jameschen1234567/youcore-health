// 後台客戶頁：客人自主訓練（唯讀）＋目標體重
import { useEffect, useState } from 'react'
import { KINDS, getTarget, listSelfWorkouts, sessionLoad, weeklySummary } from '../../lib/selfTraining'
import { listExercises } from '../../lib/training'
import WeeklyBars from '../../components/WeeklyBars'

const fmt = (d) => d.replaceAll('-', '/')

export default function AdminSelfTraining({ profileId }) {
  const [rows, setRows] = useState(null)
  const [names, setNames] = useState({})
  const [target, setTarget] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    Promise.all([listSelfWorkouts(profileId), listExercises(), getTarget(profileId)])
      .then(([r, e, t]) => { setRows(r); setNames(Object.fromEntries(e.map((x) => [x.id, x.name]))); setTarget(t) })
      .catch(() => setErr('自主訓練載入失敗'))
  }, [profileId])

  const weeks = weeklySummary(rows ?? [])
  const list = [...(rows ?? [])].reverse()
  const shown = showAll ? list : list.slice(0, 8)
  return (
    <section className="card">
      <div className="row spread head-row">
        <h2>自主訓練（{rows?.length ?? '…'} 筆）</h2>
        <span className="pill">客人自己記</span>
      </div>
      {err && <p className="error small">{err}</p>}
      <p className="small">目標體重：{target?.target_weight_kg != null ? <b>{Number(target.target_weight_kg)} kg{target.target_date && `（${fmt(target.target_date)}）`}</b> : <span className="muted">未設定</span>}</p>
      {rows && rows.length > 0 && (
        <>
          <p className="muted small">本週 {weeks.at(-1).count} 次、{weeks.at(-1).minutes} 分鐘、訓練量 {weeks.at(-1).load}（時間 × RPE）</p>
          <WeeklyBars weeks={weeks} />
          <ul className="history self-list">
            {shown.map((w) => (
              <li key={w.id}>
                <span>
                  <b>{fmt(w.done_on)} {KINDS[w.kind]}</b> {w.duration_min} 分｜RPE {w.rpe}｜量 {sessionLoad(w)}
                  {w.sets?.length > 0 && <><br /><span className="muted small">{w.sets.map((s) => `${names[s.exercise_id] ?? '動作'} ${Number(s.weight_kg)}×${s.reps}`).join('、')}</span></>}
                  {w.note && <><br /><span className="muted small">{w.note}</span></>}
                </span>
              </li>
            ))}
          </ul>
          {list.length > 8 && <button className="link-btn" onClick={() => setShowAll(!showAll)}>{showAll ? '收起' : `看全部（${list.length}）`}</button>}
        </>
      )}
      {rows && rows.length === 0 && <p className="muted small">客人還沒記錄自主訓練</p>}
    </section>
  )
}
