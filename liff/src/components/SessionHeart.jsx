// 單次訓練的心率摘要＋推估強度區間（教練端、客戶端共用）
import { hrIntensity } from '../lib/heart'

export default function SessionHeart({ s, age }) {
  if (!s.avg_hr && !s.max_hr && !s.rest_hr) return null
  const it = hrIntensity({ ...s, age })
  return (
    <div className="heart-box">
      <div className="heart-nums">
        <span><small>安靜心跳</small><b>{s.rest_hr ?? '—'}</b></span>
        <span><small>平均心率</small><b>{s.avg_hr ?? '—'}</b></span>
        <span><small>最高心率</small><b>{s.max_hr ?? '—'}</b></span>
      </div>
      {it ? (
        <>
          <p className="heart-zone">
            <span className="zone-tag" style={{ background: it.color }}>{it.zone}</span>
            <b>{it.label}</b>
            <span className="muted small">約 {it.pct}%{it.method === 'hrr' ? ' 儲備心率' : ' 最大心率'}</span>
          </p>
          <p className="muted small note">
            推估最大心率 {it.hrMax} bpm（208 − 0.7 × 年齡）{it.maxPct != null && `，最高心率達 ${it.maxPct}%`}。
            {it.method === 'hrr'
              ? '強度用 Karvonen 儲備心率法推估，不是實測的最大心率。'
              : '這次沒有安靜心跳，改用最大心率百分比推估，僅供參考。'}
          </p>
        </>
      ) : s.avg_hr ? <p className="muted small">{age == null ? '還沒填生日，無法推估強度區間' : ''}</p> : null}
    </div>
  )
}
