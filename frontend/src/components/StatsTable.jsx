import { useMemo } from 'react'

const JOINT_LABELS = {
  left_elbow:     '左肘關節',
  right_elbow:    '右肘關節',
  left_shoulder:  '左肩關節',
  right_shoulder: '右肩關節',
  left_hip:       '左髖關節',
  right_hip:      '右髖關節',
  left_knee:      '左膝關節',
  right_knee:     '右膝關節',
  left_ankle:     '左踝關節 (脛骨傾斜角)',
  right_ankle:    '右踝關節 (脛骨傾斜角)',
}

function stats(values) {
  const v = values.filter(x => x !== null && x !== undefined)
  if (!v.length) return null
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  return {
    min:   Math.min(...v).toFixed(1),
    max:   Math.max(...v).toFixed(1),
    mean:  mean.toFixed(1),
    range: (Math.max(...v) - Math.min(...v)).toFixed(1),
  }
}

export default function StatsTable({ data, activeJoints }) {
  const rows = useMemo(() => {
    if (!data?.joint_angles) return []
    return activeJoints
      .filter(j => data.joint_angles[j])
      .map(j => {
        const s = stats(data.joint_angles[j])
        return s ? { joint: j, label: JOINT_LABELS[j] || j, ...s } : null
      })
      .filter(Boolean)
  }, [data, activeJoints])

  if (!rows.length) return (
    <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>
      尚無資料
    </div>
  )

  return (
    <table className="stats-table">
      <thead>
        <tr>
          <th>關節</th>
          <th>最小值</th>
          <th>最大值</th>
          <th>平均值</th>
          <th>活動範圍 (ROM)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.joint}>
            <td style={{ fontWeight: 500 }}>{r.label}</td>
            <td>{r.min}°</td>
            <td>{r.max}°</td>
            <td>{r.mean}°</td>
            <td style={{ color: 'var(--accent)' }}>{r.range}°</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
