// 管理後台：單一客戶（刪除申請、足部量測與照片、量表、疼痛地圖、訂單）
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  adminCreateOrder, adminDeleteClient, adminGetClient, adminPhotoUrl, adminRejectDeletion,
  adminResendNotify, adminSetMemberNo, adminSetOrderStatus, adminUpdateOrderNote,
} from '../../lib/adminApi'
import { QUESTIONNAIRES } from '../../questionnaires'
import { FLAG_NOTES, SIDE_LABELS, SOURCE_LABELS, WIDTH_LABELS, buildReport, toCm } from '../../lib/foot'
import { PRODUCTS, STATUSES, nextStatus, sortOrders, statusLabel } from '../../lib/orders'
import { downloadText, footCsv, footCsvFilename } from '../../lib/csv'
import { REGION_LABELS } from '../../lib/bodyRegions'
import { fmtDate } from '../../lib/format'
import BodyMap from '../../components/BodyMap'
import { deleteFootMeasurement } from '../../lib/api'
import { DEMO } from '../../config'
import OrderCard from '../../components/OrderCard'
import AdminInfo from './AdminInfo'
import AdminBody from './AdminBody'
import AdminTraining from './AdminTraining'
import AdminHomework from './AdminHomework'
import AdminClientBookings from './AdminClientBookings'
import AdminPackages from './AdminPackages'
import { FeetEntry, InsolePanel } from './AdminFootEntry'
import AdminAssessment from './AdminAssessment'
import AdminLearning from './AdminLearning'

export default function AdminClient() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(undefined) // undefined 載入中、null 找不到
  const [error, setError] = useState(false)

  const reload = useCallback(() => {
    adminGetClient(id).then(setData).catch(() => setError(true))
  }, [id])
  useEffect(reload, [reload])

  if (error) return <main className="page"><p className="error">載入失敗</p></main>
  if (data === undefined) return <main className="page"><p className="muted">載入中…</p></main>
  if (data === null) return <main className="page"><p className="muted">找不到這位客戶（可能已刪除）</p></main>

  const { profile } = data
  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/admin')}>‹ 客戶列表</button>
      <h1>{profile.display_name || '未命名'}</h1>
      <p className="muted small">加入 {fmtDate(profile.created_at)}</p>
      <MemberNo profileId={profile.id} value={profile.member_no} onSaved={reload} />

      <DeletionPanel data={data} onDone={() => navigate('/admin')} onChange={reload} />
      <AdminInfo profileId={profile.id} />
      <AdminClientBookings profileId={profile.id} />
      <AdminPackages profileId={profile.id} />
      <AdminLearning profileId={profile.id} />
      <AdminBody profileId={profile.id} />
      <AdminTraining profileId={profile.id} />
      <AdminHomework profileId={profile.id} memberNo={profile.member_no} />
      <Orders profileId={profile.id} orders={data.orders} onChange={reload} />
      <AdminAssessment rows={data.assessments} onChange={reload} />
      <Foot profileId={profile.id} profileName={profile.display_name} rows={data.foot} onChange={reload} />
      <InsolePanel profileId={profile.id} rows={data.insoles} onChange={reload} />
      <Scales responses={data.responses} />
      <PainMap maps={data.painMaps} />
    </main>
  )
}

// ── 刪除申請 ──────────────────────────────────────────────────────────────
function DeletionPanel({ data, onDone, onChange }) {
  const req = data.deletion[0]
  const [step, setStep] = useState('idle') // idle | confirm | working | error
  const [typed, setTyped] = useState('')
  const name = data.profile.display_name || '未命名'
  if (!req) return null

  async function doDelete() {
    setStep('working')
    try {
      await adminDeleteClient(data.profile.id)
      onDone()
    } catch {
      setStep('error')
    }
  }

  return (
    <section className="card danger-card">
      <h2>⚠️ 客戶申請刪除資料</h2>
      <p className="small">申請時間：{fmtDate(req.requested_at)}。刪除會一併移除足部照片、量表、疼痛地圖、量測與訂單紀錄，<b>無法復原</b>。</p>
      {step === 'idle' && (
        <div className="row">
          <button className="btn ghost" onClick={async () => { try { await adminRejectDeletion(req.id); onChange() } catch { setStep('error') } }}>不處理（重複申請）</button>
          <button className="btn danger" onClick={() => setStep('confirm')}>刪除全部資料</button>
        </div>
      )}
      {(step === 'confirm' || step === 'working' || step === 'error') && (
        <div className="confirm">
          <label className="small">請輸入客戶名稱「{name}」確認：
            <input className="search" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </label>
          {step === 'error' && <p className="error small">刪除失敗，請稍後再試</p>}
          <div className="row">
            <button className="btn ghost" onClick={() => { setStep('idle'); setTyped('') }} disabled={step === 'working'}>取消</button>
            <button className="btn danger" onClick={doDelete} disabled={typed !== name || step === 'working'}>
              {step === 'working' ? '刪除中…' : '確定永久刪除'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

// ── 訂單 ──────────────────────────────────────────────────────────────────
function Orders({ profileId, orders, onChange }) {
  const [product, setProduct] = useState('insole')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const run = async (fn) => {
    setBusy(true)
    setErr('')
    try { await fn(); onChange() } catch { setErr('操作失敗，請稍後再試') } finally { setBusy(false) }
  }

  return (
    <>
      <h2 className="section-title">訂單</h2>
      {err && <p className="error">{err}</p>}
      {sortOrders(orders).map((o) => {
        const next = nextStatus(o.status)
        return (
          <OrderCard key={o.id} order={o}>
            <NoteEditor order={o} onSave={(t) => run(() => adminUpdateOrderNote(o.id, t))} />
            {o.status === 'ready' || o.status === 'picked_up' ? (
              <p className="small muted">
                LINE 取件通知：{o.notified_at ? `已推播（${fmtDate(o.notified_at)}）${DEMO ? '｜示範模式不會真的發送' : ''}` : '尚未推播成功'}
                {!o.notified_at && o.status === 'ready' && (
                  <button className="link-btn" onClick={() => run(() => adminResendNotify(o.id))} disabled={busy}>重送</button>
                )}
              </p>
            ) : null}
            <div className="row">
              <select aria-label="修正狀態" value={o.status} disabled={busy}
                onChange={(e) => run(() => adminSetOrderStatus(o.id, e.target.value))}>
                {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              {next && (
                <button className="btn primary" disabled={busy} onClick={() => run(() => adminSetOrderStatus(o.id, next))}>
                  改成「{statusLabel(next)}」{next === 'ready' ? '並通知' : ''}
                </button>
              )}
            </div>
          </OrderCard>
        )
      })}

      <section className="card">
        <h2>新增訂單</h2>
        <p className="muted small">到店評估完成後建立，客戶在「我的」頁面就能看到進度。改成「可取件」時會自動用 LINE 通知客戶。</p>
        <div className="form-grid">
          <label className="small">產品
            <select value={product} onChange={(e) => setProduct(e.target.value)}>
              {Object.entries(PRODUCTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="small">備註（客戶看得到）
            <input className="search" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="例如：右腳內側加強支撐" />
          </label>
        </div>
        <div className="row">
          <button className="btn primary" disabled={busy}
            onClick={() => run(async () => { await adminCreateOrder(profileId, product, note.trim()); setNote('') })}>
            建立訂單
          </button>
        </div>
      </section>
    </>
  )
}

function NoteEditor({ order, onSave }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(order.note ?? '')
  if (!editing) return <button className="link-btn" onClick={() => setEditing(true)}>{order.note ? '修改備註' : '加備註'}</button>
  return (
    <div className="row">
      <input className="search" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} aria-label="備註" />
      <button className="btn ghost" onClick={() => { onSave(text.trim() || null); setEditing(false) }}>儲存</button>
    </div>
  )
}

// ── 足部量測 ──────────────────────────────────────────────────────────────
function Foot({ profileId, profileName, rows, onChange }) {
  const report = buildReport(rows)
  return (
    <section className="card">
      <h2>足部量測（{rows.length} 筆）</h2>
      {rows.length === 0 && <p className="muted">還沒有量測</p>}
      {report.diffWarning && <p className="banner warn">最新一次左右足長差 {toCm(report.lengthDiff)} cm，建議到店確認。</p>}
      <ul className="foot-rows">
        {[...rows].reverse().map((r) => (
          <FootRow key={r.id} row={r} profileName={profileName} onDeleted={onChange} />
        ))}
      </ul>
      <FeetEntry profileId={profileId} onSaved={onChange} />
    </section>
  )
}

function FootRow({ row, profileName, onDeleted }) {
  const [url, setUrl] = useState(null)
  const [photoErr, setPhotoErr] = useState(false)
  const [del, setDel] = useState('idle') // idle | confirm | working | error
  const doDelete = async () => {
    setDel('working')
    try { await deleteFootMeasurement(row); onDeleted() } catch { setDel('error') }
  }
  const showPhoto = async () => {
    try { setUrl(await adminPhotoUrl(row.photo_path)) } catch { setPhotoErr(true) }
  }
  const csvRow = { ...row, client_name: profileName }
  return (
    <li>
      <div className="foot-row-head">
        <span><b>{SIDE_LABELS[row.side]}</b> 長 {toCm(row.length_mm)}｜前掌 {toCm(row.width_mm)}{row.heel_width_mm ? `｜腳跟 ${toCm(row.heel_width_mm)}` : ''} cm｜{SOURCE_LABELS[row.source] ?? ''}
          {row.width_class && `｜${WIDTH_LABELS[row.width_class] ?? row.width_class}`}</span>
        <span className="muted small">{fmtDate(row.created_at)}</span>
      </div>
      {(row.quality_flags ?? []).map((f) => FLAG_NOTES[f] && <p key={f} className="muted small">⚠️ {FLAG_NOTES[f]}</p>)}
      <div className="row">
        {row.photo_path && !url && <button className="link-btn" onClick={showPhoto}>看照片</button>}
        <button className="link-btn" onClick={() => downloadText(footCsvFilename(csvRow), footCsv([csvRow]))}>下載 CSV</button>
        {del === 'idle' && <button className="link-btn danger-text" onClick={() => setDel('confirm')}>刪除</button>}
      </div>
      {del !== 'idle' && (
        <div className="row confirm-row">
          <span className="small">確定刪除這筆{SIDE_LABELS[row.side]}量測？{row.photo_path ? '照片會一起刪除，' : ''}無法復原。</span>
          <button className="btn ghost" disabled={del === 'working'} onClick={() => setDel('idle')}>取消</button>
          <button className="btn danger" disabled={del === 'working'} onClick={doDelete}>{del === 'working' ? '刪除中…' : '確定刪除'}</button>
        </div>
      )}
      {del === 'error' && <p className="error small">刪除失敗，請稍後再試</p>}
      {photoErr && <p className="error small">照片載入失敗</p>}
      {url && <img className="foot-preview" src={url} alt={`${SIDE_LABELS[row.side]}照片`} />}
    </li>
  )
}

// ── 量表 ──────────────────────────────────────────────────────────────────
function Scales({ responses }) {
  const byKey = {}
  for (const r of responses) (byKey[r.questionnaire_key] ??= []).push(r)
  const keys = Object.keys(byKey)
  return (
    <section className="card">
      <h2>量表</h2>
      {keys.length === 0 && <p className="muted">還沒有填寫紀錄</p>}
      {keys.map((k) => {
        const list = byKey[k]
        const cfg = QUESTIONNAIRES[k]
        const last = list.at(-1)
        const prev = list.at(-2)
        const score = last.scores?.total?.score
        const diff = score != null && prev?.scores?.total?.score != null ? Math.round((score - prev.scores.total.score) * 10) / 10 : null
        return (
          <div key={k} className="tool-row">
            <div>
              <b>{cfg?.title ?? k}</b>{cfg?.placeholder && <span className="tag warn">佔位</span>}
              <p className="muted small">共 {list.length} 次｜最近 {fmtDate(last.submitted_at)}</p>
              {cfg && last.scores?.subscales && (
                <p className="muted small">
                  {cfg.subscales.map((s) => `${s.label} ${last.scores.subscales[s.key]?.score ?? '—'}`).join('｜')}
                </p>
              )}
            </div>
            <span className="big-num">
              {score ?? '—'}
              {diff != null && diff !== 0 && <span className={`delta ${diff < 0 ? 'good' : 'bad'}`}>{diff > 0 ? '▲' : '▼'} {Math.abs(diff)}</span>}
            </span>
          </div>
        )
      })}
    </section>
  )
}

// ── 疼痛地圖 ──────────────────────────────────────────────────────────────
function PainMap({ maps }) {
  const [view, setView] = useState('front')
  const last = maps.at(-1)
  return (
    <section className="card">
      <h2>疼痛地圖</h2>
      {!last ? <p className="muted">還沒有填寫紀錄</p> : (
        <>
          <p className="muted small">最近 {fmtDate(last.submitted_at)}（共 {maps.length} 次）</p>
          <div className="segmented two" role="tablist">
            {[['front', '正面'], ['back', '背面']].map(([k, label]) => (
              <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{label}</button>
            ))}
          </div>
          <BodyMap view={view} values={last.regions} selected={null} onSelect={() => {}} />
          <ul className="marked">
            {Object.entries(last.regions).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <li key={k}><span>{REGION_LABELS[k] ?? k}</span><b>{v}</b></li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function MemberNo({ profileId, value, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(value ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const MSG = { FORMAT: '只能用英文、數字或「-」，最多 20 字', DUPLICATE: '這個編號已經有人用了', FAILED: '儲存失敗，請稍後再試' }

  async function save() {
    setBusy(true); setErr('')
    try { await adminSetMemberNo(profileId, v); setEditing(false); onSaved() }
    catch (e) { setErr(MSG[e.message] ?? MSG.FAILED) }
    finally { setBusy(false) }
  }

  if (!editing) {
    return (
      <p>
        會員編號：<b>{value || '尚未設定'}</b>{' '}
        <button className="link-btn" onClick={() => { setV(value ?? ''); setEditing(true) }}>{value ? '修改' : '設定'}</button>
      </p>
    )
  }
  return (
    <div>
      <div className="rhr-form">
        <input className="search" autoFocus value={v} maxLength={20} onChange={(e) => setV(e.target.value)}
          placeholder="例如 YC0001" aria-label="會員編號" />
        <button className="btn ghost" disabled={busy} onClick={() => { setEditing(false); setErr('') }}>取消</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? '儲存中…' : '儲存'}</button>
      </div>
      <p className="muted small">英文會自動轉大寫；清空後儲存＝移除編號。</p>
      {err && <p className="error small">{err}</p>}
    </div>
  )
}
