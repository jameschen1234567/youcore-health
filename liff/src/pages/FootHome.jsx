// 足部首頁：我的紀錄＋兩種自己量的方法＋到店量
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { deleteFootMeasurement, deleteInsole, listFootMeasurements, listInsoles } from '../lib/api'
import { CLIENT_DELETE_HOURS, FLAG_NOTES, INSOLE_SIDE_LABELS, SOURCE_LABELS, buildReport, canClientDelete, toCm } from '../lib/foot'
import { fmtDate } from '../lib/format'
import { MessageButton } from '../components/MessageButton'

export default function FootHome() {
  const { profile } = useAuth()
  const [params] = useSearchParams()
  const [rows, setRows] = useState(null)
  const [insoles, setInsoles] = useState(null)
  const [error, setError] = useState(false)

  const reload = () => Promise.all([listFootMeasurements(profile.id), listInsoles(profile.id)])
    .then(([f, i]) => { setRows(f); setInsoles(i) }).catch(() => setError(true))
  useEffect(() => { reload() }, [profile.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const report = rows ? buildReport(rows) : null

  return (
    <main className="page">
      <h1>足部與鞋墊量測</h1>
      {params.get('new') && <p className="banner ok">✓ 已儲存！</p>}
      {error && <p className="error">紀錄載入失敗，請稍後再試</p>}

      {report && (report.left || report.right) && <Report report={report} onDeleted={reload} />}
      {insoles?.length > 0 && <Insoles rows={insoles} onDeleted={reload} />}

      <section className="card">
        <h2>方法一：量腳</h2>
        <p className="muted small">站在 A4 紙上描出位置，量足長、前掌寬、腳跟寬。自己或有人幫忙都可以。</p>
        <p className="muted small">需要：A4 紙、筆、尺。約 5 分鐘。</p>
        <Link className="btn primary block" to="/foot/measure">{report?.complete ? '重新量腳' : '開始量腳'}</Link>
      </section>
      <section className="card">
        <h2>方法二：量鞋墊</h2>
        <p className="muted small">把常穿鞋子的鞋墊拿出來，量長度和不同位置的寬度，比較符合你的鞋子。</p>
        <p className="muted small">需要：可以拿出來的鞋墊、尺。約 5 分鐘。</p>
        <Link className="btn primary block" to="/foot/insole">{insoles?.length ? '再量一雙鞋墊' : '開始量鞋墊'}</Link>
      </section>
      <section className="card">
        <h2>不想自己量？</h2>
        <p className="muted small">帶著常穿的鞋子來，我們現場幫你量。</p>
        <MessageButton text="我想預約到店量測足部與鞋墊尺寸" label="預約到店量測" />
      </section>
    </main>
  )
}

function Insoles({ rows, onDeleted }) {
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function del(id) {
    setBusy(true)
    setErr('')
    try { await deleteInsole(id); setConfirm(null); await onDeleted() } catch { setErr('刪除失敗，請透過 LINE 聯絡我們協助') } finally { setBusy(false) }
  }
  return (
    <section className="card">
      <h2>我的鞋墊尺寸</h2>
      {err && <p className="error small">{err}</p>}
      <ul className="foot-rows">
        {[...rows].reverse().map((r) => (
          <li key={r.id}>
            <div className="foot-row-head">
              <span><b>{r.note || '鞋墊'}</b>｜{INSOLE_SIDE_LABELS[r.side]}｜長 {toCm(r.length_mm)} cm</span>
              <span className="muted small">{fmtDate(r.created_at)}</span>
            </div>
            <p className="muted small">最寬 {toCm(Math.max(...r.widths.map(([, w]) => w)))} cm｜{SOURCE_LABELS[r.source]}</p>
            {r.source === 'self' && canClientDelete(r) && (confirm === r.id ? (
              <div className="row confirm-row">
                <span className="small">確定刪除這筆？</span>
                <button className="btn ghost" disabled={busy} onClick={() => setConfirm(null)}>取消</button>
                <button className="btn danger" disabled={busy} onClick={() => del(r.id)}>確定刪除</button>
              </div>
            ) : <button className="link-btn" onClick={() => setConfirm(r.id)}>刪除</button>)}
          </li>
        ))}
      </ul>
    </section>
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
          <thead><tr><th></th><th>足長</th><th>前掌寬</th><th>腳跟寬</th></tr></thead>
          <tbody>
            {sides.map(([k, label, r]) => (
              <tr key={k}>
                <th>{label}</th>
                <td>{r ? `${toCm(r.length_mm)} cm` : '—'}</td>
                <td>{r ? `${toCm(r.width_mm)} cm` : '—'}</td>
                <td>{r?.heel_width_mm ? `${toCm(r.heel_width_mm)} cm` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!report.complete && <p className="muted small note">還差一隻腳，量完會比較完整。</p>}
        {report.diffWarning && (
          <p className="banner warn">左右足長差了 {(report.lengthDiff / 10).toFixed(1)} cm，差距較大，建議再量一次。</p>
        )}
        <UndoPanel report={report} onDeleted={onDeleted} />
        {report.flags.map((f) => FLAG_NOTES[f] && <p key={f} className="muted small note">⚠️ {FLAG_NOTES[f]}</p>)}
        <p className="muted small note">自己量的數值可能有幾公釐的誤差，不是醫療診斷。訂製鞋墊前，我們會再和你確認尺寸。</p>
      </section>

      <Link className="btn ghost block" to="/scales">填寫足部量表</Link>
    </>
  )
}

// 填錯時，客戶可在 24 小時內自行刪除最新一筆（到店量的不能自己刪）
function UndoPanel({ report, onDeleted }) {
  const [confirming, setConfirming] = useState(null) // left | right
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const deletable = [['left', '左腳', report.left], ['right', '右腳', report.right]]
    .filter(([, , r]) => r?.source !== 'onsite' && canClientDelete(r))
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
      <p className="muted small">填錯了？{CLIENT_DELETE_HOURS} 小時內可以刪除這次的紀錄。</p>
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
