// 足部初篩首頁：沒有紀錄時介紹＋開始；有紀錄時顯示「我的足型報告」
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { deleteFootMeasurement, listFootMeasurements } from '../lib/api'
import { CLIENT_DELETE_HOURS, FLAG_NOTES, WIDTH_LABELS, buildReport, canClientDelete, toCm } from '../lib/foot'
import { fmtDate } from '../lib/format'
import { LINE_OA_ID } from '../config'

export default function FootHome() {
  const { profile } = useAuth()
  const [params] = useSearchParams()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(false)

  const reload = () => listFootMeasurements(profile.id).then(setRows).catch(() => setError(true))
  useEffect(() => { reload() }, [profile.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const report = rows ? buildReport(rows) : null

  return (
    <main className="page">
      <h1>足部初篩</h1>
      {params.get('new') && <p className="banner ok">✓ 量測完成！</p>}
      {error && <p className="error">紀錄載入失敗，請稍後再試</p>}

      {report && !report.left && !report.right && (
        <section className="card">
          <p>用一張 A4 紙，在家就能量出足長與足寬，拿到你的足型報告。</p>
          <p className="muted small note">需要：A4 白紙一張、深色地板、一位幫你拍照的家人或朋友。</p>
        </section>
      )}

      {report && (report.left || report.right) && <Report report={report} onDeleted={reload} />}

      <Link className={`btn block ${report?.complete ? 'ghost' : 'primary'}`} to="/foot/measure">
        {report?.left || report?.right ? '重新量測' : '開始量測'}
      </Link>
    </main>
  )
}

function Report({ report, onDeleted }) {
  const sides = [['left', '左腳', report.left], ['right', '右腳', report.right]]
  const dates = [report.left, report.right].filter(Boolean).map((r) => r.created_at).sort()
  return (
    <>
      <section className="card">
        <h2>我的足型報告</h2>
        <p className="muted small">量測日期｜{fmtDate(dates.at(-1))}</p>
        <table className="foot-table">
          <thead><tr><th></th><th>足長</th><th>足寬</th><th>足寬分類</th></tr></thead>
          <tbody>
            {sides.map(([k, label, r]) => (
              <tr key={k}>
                <th>{label}</th>
                <td>{r ? `${toCm(r.length_mm)} cm` : '—'}</td>
                <td>{r ? `${toCm(r.width_mm)} cm` : '—'}</td>
                <td>{r ? (WIDTH_LABELS[r.width_class] ?? '評估中') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!report.complete && <p className="muted small note">還差一隻腳，量完就能看完整報告。</p>}
        {report.diffWarning && (
          <p className="banner warn">左右足長差了 {(report.lengthDiff / 10).toFixed(1)} cm，差距較大，建議重拍確認。</p>
        )}
        <UndoPanel report={report} onDeleted={onDeleted} />
        {report.flags.map((f) => FLAG_NOTES[f] && <p key={f} className="muted small note">⚠️ {FLAG_NOTES[f]}</p>)}
        <p className="muted small note">這是居家拍照的<b>初步篩檢</b>，數值可能有幾公釐的誤差，不是醫療診斷。訂製鞋墊、五指鞋或拖鞋前，建議到店做完整評估。</p>
      </section>

      <section className="card">
        <h2>下一步建議</h2>
        <p className="muted small">填寫足部量表，讓我們更了解你的腳。</p>
        <div className="row">
          <Link className="btn ghost" to="/scales">填寫量表</Link>
          <BookingButton />
        </div>
      </section>
    </>
  )
}

function BookingButton() {
  if (!LINE_OA_ID) return <button className="btn primary" disabled>預約功能即將推出</button>
  const href = `https://line.me/R/oaMessage/${encodeURIComponent(LINE_OA_ID)}/?${encodeURIComponent('我想預約到店完整足部評估')}`
  return <a className="btn primary" href={href}>預約到店完整評估</a>
}

// 點錯、拍錯時，客戶可在 24 小時內自行刪除最新一筆（照片一併刪除）
function UndoPanel({ report, onDeleted }) {
  const [confirming, setConfirming] = useState(null) // left | right
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const deletable = [['left', '左腳', report.left], ['right', '右腳', report.right]]
    .filter(([, , r]) => canClientDelete(r))
  if (deletable.length === 0) return null

  async function doDelete(row) {
    setBusy(true)
    setErr('')
    try {
      await deleteFootMeasurement(row)
      setConfirming(null)
      await onDeleted()
    } catch {
      setErr('刪除失敗。超過 ' + CLIENT_DELETE_HOURS + ' 小時的紀錄請透過 LINE 聯絡我們協助刪除。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="undo">
      <p className="muted small">拍錯或點錯了？{CLIENT_DELETE_HOURS} 小時內可以刪除這次的紀錄，照片會一起刪除。</p>
      {err && <p className="error small">{err}</p>}
      <div className="row">
        {deletable.map(([k, label, r]) => confirming === k ? (
          <span key={k} className="row confirm-row">
            <span className="small">確定刪除{label}這筆？</span>
            <button className="btn ghost" disabled={busy} onClick={() => setConfirming(null)}>取消</button>
            <button className="btn danger" disabled={busy} onClick={() => doDelete(r)}>{busy ? '刪除中…' : '確定刪除'}</button>
          </span>
        ) : (
          <button key={k} className="link-btn" disabled={busy} onClick={() => setConfirming(k)}>刪除{label}紀錄</button>
        ))}
      </div>
    </div>
  )
}
