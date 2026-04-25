import { useMemo } from 'react'

const G = 9.81

const JOINT_LABELS = {
  left_hip:       '左髖關節',  right_hip:       '右髖關節',
  left_knee:      '左膝關節',  right_knee:      '右膝關節',
  left_ankle:     '左踝關節',  right_ankle:     '右踝關節',
  left_shoulder:  '左肩關節',  right_shoulder:  '右肩關節',
  left_elbow:     '左肘關節',  right_elbow:     '右肘關節',
}

function seriesStats(arr) {
  const v = (arr || []).filter(x => x !== null && x !== undefined && isFinite(x))
  if (!v.length) return null
  const abs  = v.map(Math.abs)
  const mean = abs.reduce((a, b) => a + b, 0) / abs.length
  return { mean, max: Math.max(...abs) }
}

export default function JointMoments({ data, weight, height }) {
  const { rows, hasReal } = useMemo(() => {
    if (!data?.joint_moments) return { rows: [], hasReal: false }

    const bs    = data.body_scale
    const hm    = height ? parseFloat(height) / 100 : null
    const wkg   = weight ? parseFloat(weight) : null
    const scale = (bs && hm && bs > 0) ? hm / bs : null
    const hr    = !!(wkg && scale)

    const r = Object.entries(data.joint_moments).map(([joint, series]) => {
      const s = seriesStats(series)
      if (!s) return null
      return {
        joint,
        label:    JOINT_LABELS[joint] || joint,
        mean_nm:  hr ? Math.round(s.mean * wkg * G * scale) : null,
        max_nm:   hr ? Math.round(s.max  * wkg * G * scale) : null,
        mean_raw: s.mean,
        max_raw:  s.max,
      }
    }).filter(Boolean)

    return { rows: r, hasReal: hr }
  }, [data, weight, height])

  // No joint_moments field → old analysis data
  if (!data?.joint_moments) {
    return (
      <div className="card">
        <div className="card-title">關節力矩分析</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>
          此筆分析資料不含力矩指標，請重新上傳影片分析以顯示此區塊。
        </div>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="card">
        <div className="card-title">關節力矩分析</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>
          關節點信心度不足，無法計算力矩。請確認影片中人體清晰可見。
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-title">關節力矩分析（準靜態重力力矩）</div>
      {!hasReal && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
          ℹ 輸入身高與體重後可顯示 N·m 單位
        </div>
      )}
      <table className="stats-table">
        <thead>
          <tr>
            <th>關節</th>
            <th>平均力矩 {hasReal ? '(N·m)' : '(norm)'}</th>
            <th>峰值力矩 {hasReal ? '(N·m)' : '(norm)'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.joint}>
              <td style={{ fontWeight: 500 }}>{r.label}</td>
              <td>{hasReal ? r.mean_nm : r.mean_raw.toFixed(4)}</td>
              <td style={{ color: 'var(--accent-r)' }}>
                {hasReal ? r.max_nm : r.max_raw.toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 8 }}>
        * 準靜態重力力矩模型，不含慣性項。需肌肉收縮才能對抗重力維持姿勢。
      </div>
    </div>
  )
}
