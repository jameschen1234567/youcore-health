// 後台：客戶自評（報告、原始資料、照片標點、鞋墊參考）
import { useState } from 'react'
import AssessReport from '../../components/AssessReport'
import { ArchOverlay } from '../../components/ArchMarker'
import { ARCH_VERSION, FOOTPRINTS, PAINS, RED_FLAGS, TIPTOE, USES, buildAssessment, insoleHint, nnht } from '../../lib/archModel'
import { deleteAssessment } from '../../lib/api'
import { adminPhotoUrl } from '../../lib/adminApi'
import { toCm, widthsToText } from '../../lib/foot'
import { fmtDate } from '../../lib/format'

const SIDES = [['left', '左腳'], ['right', '右腳']]
const name = (list, k) => list.find(([x]) => x === (k ?? ''))?.[1] ?? '—'

export default function AdminAssessment({ rows, onChange }) {
  const [open, setOpen] = useState(rows.at(-1)?.id)
  return (
    <section className="card">
      <h2>足型自評（{rows.length} 次）</h2>
      {rows.length === 0 && <p className="muted">客戶還沒有自評</p>}
      {[...rows].reverse().map((r) => (
        <div key={r.id} className="assess-row">
          <button className="link-btn" onClick={() => setOpen(open === r.id ? null : r.id)}>{fmtDate(r.created_at)} {open === r.id ? '收合' : '展開'}</button>
          {open === r.id && <Detail r={r} onChange={onChange} />}
        </div>
      ))}
    </section>
  )
}

function Detail({ r, onChange }) {
  const d = r.data
  const result = buildAssessment(d, d.age) // 用目前模型重算
  const red = RED_FLAGS.filter(([k]) => d.red_flags?.includes(k))
  const [msg, setMsg] = useState('')
  const [confirm, setConfirm] = useState(false)
  const copy = async (w) => { try { await navigator.clipboard.writeText(widthsToText(w)); setMsg('已複製') } catch { setMsg('無法複製') } }
  const del = async () => { try { await deleteAssessment(r); onChange() } catch { setMsg('刪除失敗') } }
  return (
    <>
      {red.length > 0 && <p className="banner warn">警示：{red.map(([, t]) => t).join('；')}</p>}
      {r.algo_version !== ARCH_VERSION && <p className="muted small">送出時模型 {r.algo_version}，以下用 {ARCH_VERSION} 重算</p>}
      <AssessReport result={result} />
      <p className="small">不適：{(d.pain ?? []).map((k) => name(PAINS, k)).join('、') || '—'}｜用途：{name(USES, d.use)}</p>
      {SIDES.map(([s, label]) => {
        const f = d.feet[s], a = d.arch[s] ?? {}
        const nh = result[s].items.find((i) => i.key === 'nh')?.value
        const hint = insoleHint(result[s].level, f.arch_clearance_mm)
        return (
          <div key={s} className="assess-side">
            <b>{label}</b>
            <p className="small">長 {toCm(f.length_mm)}｜腳跟到第一蹠骨頭 {toCm(f.ball_length_mm)}｜前掌 {toCm(f.width_mm)}｜腳跟 {toCm(f.heel_width_mm)} cm</p>
            <p className="muted small">腳寬（距腳跟:寬 mm）{f.widths.map(([p, w]) => `${p}:${w}`).join('、')} <button className="link-btn" onClick={() => copy(f.widths)}>複製</button></p>
            <p className="muted small">腳印：{name(FOOTPRINTS, a.footprint)}｜踮腳：{name(TIPTOE, a.tiptoe)}｜自量足弓淨空 AH：{f.arch_clearance_mm != null ? `${f.arch_clearance_mm} mm` : '未提供'}{nnht(nh, f.ball_length_mm) ? `｜NNHt ${nnht(nh, f.ball_length_mm)}（一般 0.27±0.03、扁平 0.18±0.04）` : ''}</p>
            {hint && <p className="small">鞋墊參考：{hint.support}；切片填充 {hint.infill}%；{hint.heightMm ? `足弓托高 ${hint.heightMm} mm（AH × ${hint.contact}，不可超過 AH）` : '未提供 AH，足弓托高需到店量'}</p>}
            <Photo path={r[`photo_${s}`]} arch={a} />
          </div>
        )
      })}
      <p className="muted small">鞋墊參考沿用處方引擎的對照，只依足弓高度分級，沒有 FPI-6、舟骨下降與後跟排列；製作前一定要到店量 AH。</p>
      {msg && <p className="muted small">{msg}</p>}
      {confirm ? (
        <div className="row confirm-row">
          <span className="small">刪除這次自評？尺寸與照片一起刪除，無法復原。</span>
          <button className="btn ghost" onClick={() => setConfirm(false)}>取消</button>
          <button className="btn danger" onClick={del}>確定刪除</button>
        </div>
      ) : <button className="link-btn danger-text" onClick={() => setConfirm(true)}>刪除這次自評</button>}
    </>
  )
}

function Photo({ path, arch }) {
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState(false)
  if (!path) return <p className="muted small">沒有照片</p>
  if (!url) return <button className="link-btn" onClick={() => adminPhotoUrl(path).then(setUrl).catch(() => setErr(true))}>{err ? '載入失敗，再試一次' : '看照片與標點'}</button>
  const size = arch.photo_size
  return <div className="arch-box still"><img src={url} alt="內側照片" />{size && arch.points && <ArchOverlay points={arch.points} w={size.w} h={size.h} />}</div>
}
