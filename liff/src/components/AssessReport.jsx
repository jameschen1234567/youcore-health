// 足型初步報告（客戶與後台共用；鞋墊製作參數只在後台另外顯示）
import { CONSISTENCY, CUTS, LEVELS, LEVEL_SHORT, meaningOf } from '../lib/archModel'

const SIDES = [['left', '左腳'], ['right', '右腳']]
const range = (k) => `${CUTS[k].cut[1]} 到 ${CUTS[k].cut[2]}${CUTS[k].unit === '°' ? '' : ' '}${CUTS[k].unit}`

export default function AssessReport({ result }) {
  return (
    <>
      {result.child && <p className="banner warn">未滿 18 歲的足弓還在發育，這個模型不適用，請由兒童骨科或復健科評估。</p>}
      {SIDES.map(([s, label]) => <Side key={s} label={label} r={result[s]} />)}
      {result.notes.map((n) => <p key={n} className="banner warn">{n}</p>)}
    </>
  )
}

function Side({ label, r }) {
  return (
    <div className="assess-side">
      <div className="row spread"><b>{label}</b><span className="pill">{r.level == null ? '無法判定' : LEVEL_SHORT[r.level]}</span></div>
      {r.level != null && (
        <div className="arch-scale" role="img" aria-label={`足弓高度：${LEVELS[r.level]}`}>
          {[-2, -1, 0, 1, 2].map((l) => <span key={l} className={l === r.level ? 'on' : ''}>{LEVELS[l]}</span>)}
        </div>
      )}
      {r.items.length > 0 && (
        <table className="foot-table small-table">
          <thead><tr><th>項目</th><th>你的</th><th>一般範圍</th><th>判定</th></tr></thead>
          <tbody>
            {r.items.map((i) => (
              <tr key={i.key}><th>{CUTS[i.key].label}</th><td>{i.value}{CUTS[i.key].unit}</td><td>{range(i.key)}</td><td>{LEVELS[i.level]}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {r.level != null && <p className="small">{meaningOf(r.level)}</p>}
      {r.level < 0 && r.flexible === 'appears' && <p className="small">踮腳時足弓會出現，比較像<b>柔軟性</b>的足弓塌陷。</p>}
      {(r.flexible === 'no' || r.flexible === 'cannot') && <p className="small">踮腳時足弓沒有出現或踮不起來，建議先由醫師評估。</p>}
      <p className="muted small">{CONSISTENCY[r.consistency]}</p>
    </div>
  )
}
