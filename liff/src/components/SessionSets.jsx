// 一次訓練的組數表格（客戶端明細、後台列表共用）
import { estimate1RM } from '../lib/strength'

const fmtKg = (n) => `${Number(n)}`

export default function SessionSets({ groups, exercises }) {
  const names = Object.fromEntries(exercises.map((e) => [e.id, e.name]))
  if (groups.length === 0) return <p className="muted small">這次沒有記錄動作</p>
  return groups.map(({ exercise_id, sets }) => {
    const best = Math.max(...sets.map((s) => estimate1RM(s) ?? 0))
    return (
      <section key={exercise_id} className="card">
        <h2>{names[exercise_id] ?? '動作'}</h2>
        <table className="sets-table">
          <thead><tr><th>組</th><th>重量</th><th>次數</th><th>RPE</th></tr></thead>
          <tbody>
            {sets.map((s) => (
              <tr key={s.id ?? `${s.set_no}`}>
                <td>{s.set_no}</td>
                <td>{fmtKg(s.weight_kg)} kg</td>
                <td>{s.reps}</td>
                <td>{s.rpe ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {best > 0 && <p className="muted small">推估 1RM：{best} kg</p>}
      </section>
    )
  })
}
