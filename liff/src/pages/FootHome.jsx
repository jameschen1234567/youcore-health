// 足部首頁：初步報告、開始自評、到店量
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { deleteAssessment, listAssessments, listFootMeasurements, listInsoles } from '../lib/api'
import { CLIENT_DELETE_HOURS, SOURCE_LABELS, buildReport, canClientDelete, toCm } from '../lib/foot'
import { RED_FLAGS } from '../lib/archModel'
import { fmtDate } from '../lib/format'
import { MessageButton } from '../components/MessageButton'
import AssessReport from '../components/AssessReport'

export default function FootHome() {
  const { profile } = useAuth()
  const [params] = useSearchParams()
  const [d, setD] = useState(null)
  const [error, setError] = useState(false)
  const reload = () => Promise.all([listFootMeasurements(profile.id), listInsoles(profile.id), listAssessments(profile.id)])
    .then(([feet, insoles, assess]) => setD({ feet, insoles, assess })).catch(() => setError(true))
  useEffect(() => { reload() }, [profile.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const latest = d?.assess.at(-1)
  const sizes = d ? buildReport(d.feet) : null
  const insole = d?.insoles.at(-1)

  return (
    <main className="page">
      <h1>足部與鞋墊</h1>
      {params.get('new') && <p className="banner ok">✓ 已送出！以下是初步報告。</p>}
      {params.get('photo') === '0' && <p className="banner warn">有照片沒有上傳成功，其他資料都已儲存。</p>}
      {error && <p className="error">紀錄載入失敗，請稍後再試</p>}

      {latest && <Report row={latest} onDeleted={reload} />}
      {sizes && (sizes.left || sizes.right) && <Sizes report={sizes} insole={insole} />}

      <section className="card">
        <h2>{latest ? '重新自評' : '足型自評'}</h2>
        <p className="muted small">量腳和量鞋墊都完成後，會產生你的<b>足型初步報告</b>。約 15 到 20 分鐘，可以分次填，數字會先存在這支手機。</p>
        <p className="muted small">需要：A4 紙 2 張、筆、尺、常穿鞋子的鞋墊，以及手機拍腳的內側。</p>
        <Link className={`btn block ${latest ? 'ghost' : 'primary'}`} to="/foot/measure">{latest ? '重新自評' : '開始自評'}</Link>
      </section>
      <section className="card">
        <h2>到店量測（建議）</h2>
        <p className="muted small">詳細報告與鞋墊製作，需要到店由我們實際量測。請帶常穿的鞋子。</p>
        <MessageButton text="我想預約到店量測足部與鞋墊" label="預約到店量測" />
      </section>
      <Link className="btn ghost block" to="/scales">填寫足部量表</Link>
    </main>
  )
}

function Report({ row, onDeleted }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const red = RED_FLAGS.filter(([k]) => row.data.red_flags?.includes(k))
  async function del() {
    setBusy(true)
    try { await deleteAssessment(row); setConfirm(false); await onDeleted() } catch { setErr('刪除失敗，請透過 LINE 聯絡我們協助') } finally { setBusy(false) }
  }
  return (
    <section className="card">
      <h2>足型初步報告</h2>
      <p className="muted small">{fmtDate(row.created_at)}｜依你自己量的資料</p>
      {red.length > 0 && <p className="banner warn">你勾選了「{red.map(([, t]) => t).join('」「')}」，請先由醫師評估，再考慮鞋墊或訓練。</p>}
      <AssessReport result={row.result} />
      <p className="muted small note">這是自評的<b>初步篩檢</b>，不是醫療診斷。自己標點與拍照會有誤差，參考值來自丹麥 254 位成人（Nilsson 2012），不是台灣常模。鞋墊的足弓高度會以到店實際量測為準。</p>
      {canClientDelete(row) && (confirm ? (
        <div className="row confirm-row">
          <span className="small">確定刪除這次自評？尺寸和照片會一起刪除。</span>
          <button className="btn ghost" disabled={busy} onClick={() => setConfirm(false)}>取消</button>
          <button className="btn danger" disabled={busy} onClick={del}>確定刪除</button>
        </div>
      ) : <button className="link-btn" onClick={() => setConfirm(true)}>填錯了，刪除這次（{CLIENT_DELETE_HOURS} 小時內）</button>)}
      {err && <p className="error small">{err}</p>}
    </section>
  )
}

function Sizes({ report, insole }) {
  return (
    <section className="card">
      <h2>我的尺寸</h2>
      <table className="foot-table">
        <thead><tr><th></th><th>足長</th><th>前掌寬</th><th>腳跟寬</th></tr></thead>
        <tbody>
          {[['左腳', report.left], ['右腳', report.right]].map(([label, r]) => (
            <tr key={label}><th>{label}</th><td>{r ? toCm(r.length_mm) : '—'}</td><td>{r ? toCm(r.width_mm) : '—'}</td><td>{r?.heel_width_mm ? toCm(r.heel_width_mm) : '—'}</td></tr>
          ))}
        </tbody>
      </table>
      {insole && <p className="small">鞋墊{insole.note ? `（${insole.note}）` : ''}：長 {toCm(insole.length_mm)}、最寬 {toCm(Math.max(...insole.widths.map(([, w]) => w)))} 公分</p>}
      <p className="muted small">單位公分｜{[...new Set([report.left, report.right].filter(Boolean).map((r) => SOURCE_LABELS[r.source]))].join('、')}</p>
    </section>
  )
}
