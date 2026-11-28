// 客戶端「訓練」分頁：身體組成折線圖、最大肌力推估、訓練紀錄（只能看，由教練記錄）
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { fmtDay, getProfileInfo, listBodyComps, listExercises, listTrainingSessions, toDate } from '../lib/training'
import { BODY_METRICS, ageFrom, e1rmHistory, latestDelta, metricValue } from '../lib/strength'
import { heartLine, listRestingHr } from '../lib/heart'
import LineChart from '../components/LineChart'
import RestingHrCard from '../components/RestingHrCard'
import HealthSyncCard from '../components/HealthSyncCard'
import HomeworkCard from '../components/HomeworkCard'
import SelfTrainingCard from '../components/SelfTrainingCard'
import DietCard from '../components/DietCard'
import EnergyCard from '../components/EnergyCard'
import { isNutrition } from '../lib/energy'
import TargetWeightCard from '../components/TargetWeightCard'
import { getTarget } from '../lib/selfTraining'
import { isMember } from '../lib/homework'

export default function Training() {
  const { profile } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  const [rhr, setRhr] = useState(null)
  const [target, setTarget] = useState(null)
  const member = isMember(profile)
  const nutrition = isNutrition(profile)
  const reloadTarget = () => getTarget(profile.id).then(setTarget).catch(() => setTarget({}))
  const reloadRhr = () => listRestingHr(profile.id).then(setRhr).catch(() => setRhr([]))

  useEffect(() => {
    Promise.all([listBodyComps(profile.id), listTrainingSessions(profile.id), listExercises(), getProfileInfo(profile.id).catch(() => ({}))])
      .then(([body, sessions, exercises, info]) => setData({ body, sessions, exercises, info, age: ageFrom(info?.birthday) }))
      .catch(() => setError(true))
    reloadRhr()
    if (member) reloadTarget()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, member])

  return (
    <main className="page">
      <h1>訓練</h1>
      {error && <p className="error">資料載入失敗，請稍後再試</p>}
      {!data && !error && <p className="muted">載入中…</p>}
      <HomeworkCard profile={profile} />
      <section className="card">
        <div className="row spread"><h2>我的影像紀錄</h2><Link className="link-btn" to="/media">查看 ›</Link></div>
        <p className="muted small">教練拍的動作影片、Before／After 對照與講解（會員專屬）。</p>
      </section>
      {member && <SelfTrainingCard profile={profile} />}
      {nutrition && <DietCard profile={profile} />}
      {nutrition && data && <EnergyCard profile={profile} body={data.body} sessions={data.sessions} info={data.info} age={data.age} />}
      {member && <HealthSyncCard profile={profile} nutrition={nutrition} onSynced={reloadRhr} />}
      {rhr && <RestingHrCard profileId={profile.id} rows={rhr} onSaved={reloadRhr} />}
      {member && data && target && <TargetWeightCard profileId={profile.id} target={target} bodyRows={data.body} onSaved={reloadTarget} />}
      {data && data.body.length === 0 && data.sessions.length === 0 && (
        <section className="card">
          <p>每次到店訓練後，教練會幫你記錄身體組成與訓練內容，你可以在這裡看到自己的進步。</p>
        </section>
      )}
      {data && data.body.length > 0 && <BodySection rows={data.body} target={member ? target?.target_weight_kg : null} />}
      {data && data.sessions.length > 0 && <StrengthSection sessions={data.sessions} exercises={data.exercises} />}
      {data && data.sessions.length > 0 && <SessionList sessions={data.sessions} exercises={data.exercises} age={data.age} />}
    </main>
  )
}

function BodySection({ rows, target }) {
  const [metric, setMetric] = useState('weight_kg')
  const m = BODY_METRICS.find((x) => x.key === metric)
  const points = rows.map((r) => ({ x: toDate(r.measured_on), y: metricValue(r, metric) })).filter((p) => p.y != null)
  const last = [...rows].reverse().find((r) => metricValue(r, metric) != null)
  const delta = latestDelta(rows, metric)
  return (
    <section className="card">
      <h2>身體組成</h2>
      <div className="chips">
        {BODY_METRICS.map((x) => (
          <button key={x.key} className={`chip ${metric === x.key ? 'on' : ''}`} onClick={() => setMetric(x.key)}>{x.label}</button>
        ))}
      </div>
      {last ? (
        <p className="stat">
          <span className="big-num">{metricValue(last, metric)}<small> {m.unit}</small></span>
          {delta != null && delta !== 0 && <span className="delta neutral">比上次 {delta > 0 ? '+' : ''}{delta} {m.unit}</span>}
          {delta === 0 && <span className="delta neutral">與上次相同</span>}
          <span className="muted small">{fmtDay(last.measured_on)}</span>
        </p>
      ) : <p className="muted">還沒有{m.label}的紀錄</p>}
      {points.length > 0 && (
        <LineChart auto unit={m.unit} label={`${m.label}趨勢圖`} series={[
          { key: metric, label: m.label, color: 'var(--brand)', points },
          ...(metric === 'weight_kg' && target != null && points.length > 0
            ? [{ key: 'target', label: `目標 ${Number(target)} kg`, color: 'var(--accent)', dashed: true, points: [{ x: points[0].x, y: Number(target) }, { x: points.at(-1).x, y: Number(target) }] }]
            : []),
        ]} />
      )}
    </section>
  )
}

function StrengthSection({ sessions, exercises }) {
  const history = useMemo(() => e1rmHistory(sessions), [sessions])
  const names = Object.fromEntries(exercises.map((e) => [e.id, e.name]))
  const options = Object.keys(history).filter((id) => names[id])
  const [ex, setEx] = useState(options[0] ?? '')
  if (options.length === 0) return null
  const cur = history[ex] ?? []
  const last = cur.at(-1)
  const prev = cur.at(-2)
  const delta = last && prev ? Math.round((last.e1rm - prev.e1rm) * 10) / 10 : null
  return (
    <section className="card">
      <h2>最大肌力推估（1RM）</h2>
      <select aria-label="選擇動作" value={ex} onChange={(e) => setEx(e.target.value)}>
        {options.map((id) => <option key={id} value={id}>{names[id]}</option>)}
      </select>
      {last && (
        <p className="stat">
          <span className="big-num">{last.e1rm}<small> kg</small></span>
          {delta != null && delta !== 0 && <span className={`delta ${delta > 0 ? 'good' : 'bad'}`}>比上次 {delta > 0 ? '+' : ''}{delta} kg</span>}
          <span className="muted small">{fmtDay(last.date)}</span>
        </p>
      )}
      <LineChart auto unit=" kg" label={`${names[ex]}最大肌力趨勢圖`}
        series={[{ key: ex, label: names[ex], color: 'var(--accent)', points: cur.map((p) => ({ x: toDate(p.date), y: p.e1rm })) }]} />
      <p className="muted small note">依每組的重量、次數與 RPE 推估（NSCA 換算表），不是實際測驗的最大重量。沒記 RPE 的組（熱身）不列入；優先採用換算後 10 下以內的組，沒有才用 11～15 下的組。</p>
    </section>
  )
}

function SessionList({ sessions, exercises, age }) {
  const names = Object.fromEntries(exercises.map((e) => [e.id, e.name]))
  return (
    <>
      <h2 className="section-title">訓練紀錄</h2>
      <ul className="client-list">
        {[...sessions].reverse().map((s) => {
          const exIds = [...new Set(s.sets.map((x) => x.exercise_id))]
          return (
            <li key={s.id}>
              <Link to={`/training/${s.id}`}>
                <span>
                  <b>{fmtDay(s.session_date)}</b>
                  <span className="muted small">{exIds.map((id) => names[id] ?? '動作').join('、') || '沒有動作'}｜{s.sets.length} 組</span>
                  {s.avg_hr && <span className="muted small">{heartLine(s, age)}</span>}
                </span>
                <span aria-hidden="true">›</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
