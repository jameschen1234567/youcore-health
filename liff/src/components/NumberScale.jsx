// 0–10 點選量尺（手機上比滑桿好點、也比較不會誤觸）
import { NA } from '../lib/scoring'

export default function NumberScale({ scale, value, onChange }) {
  const nums = Array.from({ length: scale.max - scale.min + 1 }, (_, i) => scale.min + i)
  return (
    <div className="nscale">
      <div className="nscale-grid" role="radiogroup">
        {nums.map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n}
            className={`nscale-btn ${value === n ? 'on' : ''}`}
            style={{ '--heat': (n - scale.min) / (scale.max - scale.min) }}
            onClick={() => onChange(n)}>
            {n}
          </button>
        ))}
      </div>
      <div className="nscale-labels">
        <span>{scale.minLabel}</span>
        <span>{scale.maxLabel}</span>
      </div>
      {scale.allowNA && (
        <button type="button" className={`btn ghost block na ${value === NA ? 'on' : ''}`} onClick={() => onChange(NA)}>
          不適用（沒有遇到這個情境）
        </button>
      )}
    </div>
  )
}
