import { useMemo } from 'react'

const G = 9.81

function metric(label, value, unit, sub) {
  return (
    <div className="jump-metric">
      <div className="jump-metric-value">
        {value ?? '—'}
        <span className="jump-metric-unit">{value != null ? unit : ''}</span>
      </div>
      <div className="jump-metric-label">{label}</div>
      {sub && <div className="jump-metric-sub">{sub}</div>}
    </div>
  )
}

export default function JumpAnalysis({ data, weight, height }) {
  const { scale_m, jumpData } = useMemo(() => {
    if (!data?.jump_metrics) return { scale_m: null, jumpData: null }

    const bs  = data.body_scale
    const hm  = height ? parseFloat(height) / 100 : null
    const wkg = weight ? parseFloat(weight) : null
    const scale = (bs && hm && bs > 0) ? hm / bs : null

    const jm = data.jump_metrics
    const pv_norm  = jm.peak_velocity_norm   // negative = upward in image coords
    const maxH_norm = jm.max_height_norm

    const peak_v_ms = (scale && pv_norm != null)
      ? +(Math.abs(pv_norm) * scale).toFixed(2) : null
    const max_h_cm  = (scale && maxH_norm != null)
      ? +(maxH_norm * scale * 100).toFixed(1) : null

    // Peak power P = m × g × v_takeoff (Watts)
    const peak_power_w = (wkg && peak_v_ms != null)
      ? Math.round(wkg * G * peak_v_ms) : null
    const rel_power = (wkg && peak_power_w != null)
      ? +(peak_power_w / wkg).toFixed(1) : null

    const jumps = (jm.jumps || []).map((j, idx) => ({
      no:  idx + 1,
      t:   j.timestamp.toFixed(2),
      h_cm: (scale && j.height_norm != null)
              ? +(j.height_norm * scale * 100).toFixed(1) : null,
      v_ms: (scale && j.peak_velocity_norm != null)
              ? +(Math.abs(j.peak_velocity_norm) * scale).toFixed(2) : null,
      p_w:  (wkg && scale && j.peak_velocity_norm != null)
              ? Math.round(wkg * G * Math.abs(j.peak_velocity_norm) * scale) : null,
      h_raw: j.height_norm,
      v_raw: j.peak_velocity_norm,
    }))

    return { scale_m: scale, jumpData: { peak_v_ms, max_h_cm, peak_power_w, rel_power, jumps } }
  }, [data, weight, height])

  // No jump_metrics field → data from old analysis
  if (!data?.jump_metrics) {
    return (
      <div className="card">
        <div className="card-title">重心（COM）跳躍分析</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>
          此筆分析資料不含跳躍指標，請重新上傳影片分析以顯示此區塊。
        </div>
      </div>
    )
  }

  const noScale  = !scale_m
  const noJumps  = !jumpData?.jumps?.length
  const jm       = data.jump_metrics

  return (
    <div className="card">
      <div className="card-title">重心（COM）跳躍分析</div>

      {noScale && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
          ℹ 輸入身高與體重後可顯示公制單位（cm、m/s、W）
        </div>
      )}

      <div className="jump-metrics-row">
        {metric(
          '最大跳躍高度',
          jumpData?.max_h_cm,
          ' cm',
          noScale ? `${((jm.max_height_norm || 0) * 100).toFixed(1)}% of frame` : null
        )}
        {metric(
          '起跳速度',
          jumpData?.peak_v_ms,
          ' m/s',
          noScale ? `norm ${Math.abs(jm.peak_velocity_norm || 0).toFixed(3)}` : null
        )}
        {metric(
          '峰值跳躍功率',
          jumpData?.peak_power_w != null ? jumpData.peak_power_w.toLocaleString() : null,
          ' W',
          jumpData?.rel_power != null ? `${jumpData.rel_power} W/kg` : (noScale ? '需輸入體重與身高' : null)
        )}
      </div>

      {!noJumps && (
        <>
          <div className="card-title" style={{ marginTop: 16 }}>各次跳躍明細</div>
          <table className="stats-table">
            <thead>
              <tr>
                <th>#</th>
                <th>時間 (s)</th>
                <th>高度 {noScale ? '(% frame)' : '(cm)'}</th>
                <th>起跳速度 {noScale ? '(norm/s)' : '(m/s)'}</th>
                <th>峰值功率 {noScale ? '' : '(W)'}</th>
              </tr>
            </thead>
            <tbody>
              {jumpData.jumps.map(j => (
                <tr key={j.no}>
                  <td>{j.no}</td>
                  <td>{j.t}</td>
                  <td style={{ color: 'var(--accent)' }}>
                    {noScale
                      ? `${((j.h_raw || 0) * 100).toFixed(1)}%`
                      : `${j.h_cm ?? '—'} cm`}
                  </td>
                  <td>
                    {noScale
                      ? Math.abs(j.v_raw || 0).toFixed(3)
                      : `${j.v_ms ?? '—'} m/s`}
                  </td>
                  <td>
                    {noScale ? '—' : (j.p_w != null ? `${j.p_w.toLocaleString()} W` : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {noJumps && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>
          未偵測到明顯跳躍動作（振幅需 &gt; 身高 1.5%）
        </div>
      )}
    </div>
  )
}
