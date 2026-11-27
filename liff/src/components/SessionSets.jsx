// 一次訓練的組數表格（客戶端明細、後台列表共用）
import { bestE1RM } from '../lib/strength'
import { hrIntensity } from '../lib/heart'

const fmtKg = (n) => `${Number(n)}`

export default function SessionSets({ groups, exercises, age = null, restHr = null }) {
  const names = Object.fromEntries(exercises.map((e) => [e.id, e.name]))
  if (groups.length === 0) return <p className="muted small">這次沒有記錄動作</p>
  return groups.map(({ exercise_id, sets }) => {
    const best = bestE1RM(sets)
    const hasHr = sets.some((s) => s.hr)
    return (
      <section key={exercise_id} className="card">
        <h2>{names[exercise_id] ?? '動作'}</h2>
        <table className="sets-table">
          <thead><tr><th>組</th><th>重量</th><th>次數</th><th>RPE</th>{hasHr && <th>心率</th>}</tr></thead>
          <tbody>
            {sets.map((s) => (
              <tr key={s.id ?? `${s.set_no}`}>
                <td>{s.set_no}</td>
                <td>{fmtKg(s.weight_kg)} kg</td>
                <td>{s.reps}</td>
                <td>{s.rpe ?? '—'}</td>
                {hasHr && <td><SetHr hr={s.hr} age={age} restHr={restHr} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {best && <p className="muted small">推估 1RM：{best.e1rm} kg{best.precise ? '' : '（高次數組推估，誤差較大）'}</p>}
      </section>
    )
  })
}

function SetHr({ hr, age, restHr }) {
  if (!hr) return '—'
  const it = hrIntensity({ avg_hr: hr, rest_hr: restHr, age })
  return (
    <span className="set-hr">
      {hr}
      {it && <span className="zone-tag sm" style={{ background: it.color }} title={`${it.label} 約 ${it.pct}%`}>{it.zone}</span>}
    </span>
  )
}
