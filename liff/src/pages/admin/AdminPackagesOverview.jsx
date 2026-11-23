// 後台：課程包總覽（全部客人的購買堂數、剩餘堂數、到期日；快到期／快用完提醒）— 只有管理員看得到
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminListClients } from '../../lib/adminApi'
import { listServices } from '../../lib/booking'
import { LOW_LEFT, PACKAGE_STATUS, SOON_DAYS, adminListAllPackages, daysLeft, packageAlerts, packageStats } from '../../lib/packages'
import { AddPackage } from './AdminPackages'

const FILTERS = [['alert', '需要注意'], ['active', '使用中'], ['all', '全部']]
const who = (p) => p.profile?.full_name || p.profile?.display_name || '客戶'
const fmtD = (d) => (d ? d.replaceAll('-', '/') : '不限期')

export default function AdminPackagesOverview() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [clients, setClients] = useState(null)
  const [services, setServices] = useState([])
  const [filter, setFilter] = useState('alert')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')

  const reload = useCallback(() => adminListAllPackages().then(setRows).catch(() => setErr('載入失敗')), [])
  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    if (adding && !clients) {
      Promise.all([adminListClients(), listServices({ all: true })])
        .then(([c, s]) => { setClients(c); setServices(s.filter((x) => !x.is_trial)) })
        .catch(() => setErr('客戶清單載入失敗'))
    }
  }, [adding, clients])

  const all = (rows ?? []).map((p) => ({ ...p, st: packageStats(p) }))
  const alerts = new Map(packageAlerts(rows ?? []).map((p) => [p.id, p.reasons]))
  const shown = all
    .filter((p) => filter === 'all' || (filter === 'alert' ? alerts.has(p.id) : p.st.status === 'active'))
    .filter((p) => !q || who(p).toLowerCase().includes(q.toLowerCase()))
  const totalLeft = all.filter((p) => p.st.status === 'active').reduce((n, p) => n + p.st.remaining, 0)

  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/admin')}>‹ 管理後台</button>
      <div className="row spread head-row">
        <h1>課程包總覽</h1>
        <span className="pill private">僅後台可見</span>
      </div>
      {err && <p className="error">{err}</p>}
      <p className="muted small">
        使用中 {all.filter((p) => p.st.status === 'active').length} 包，共剩 {totalLeft} 堂｜需要注意 {alerts.size} 包
        （{SOON_DAYS} 天內到期、剩 {LOW_LEFT} 堂以下、已到期還有剩）
      </p>

      {adding
        ? <section className="card"><h2>新增課程包</h2>
            <AddPackage clients={clients} services={services} onCancel={() => setAdding(false)} onDone={async () => { setAdding(false); await reload() }} />
          </section>
        : <button className="btn primary block" onClick={() => setAdding(true)}>＋ 新增／導入客人課程包</button>}

      <input className="search" type="search" placeholder="搜尋客人姓名" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        {FILTERS.map(([k, label]) => (
          <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
            {label}{k === 'alert' && alerts.size ? `（${alerts.size}）` : ''}
          </button>
        ))}
      </div>

      {rows && shown.length === 0 && <p className="muted">{filter === 'alert' ? '目前沒有需要注意的課程包 👍' : '沒有符合的課程包'}</p>}
      <ul className="client-list">
        {shown.map((p) => {
          const left = daysLeft(p.expires_on)
          return (
            <li key={p.id}>
              <Link to={`/admin/client/${p.profile_id}`}>
                <span>
                  <b>{who(p)}</b>
                  <span className="muted small">{p.service?.name}｜到期 {fmtD(p.expires_on)}{left !== null && p.st.status === 'active' ? `（${left} 天）` : ''}</span>
                  {alerts.has(p.id) && <span className="small error">⚠️ {alerts.get(p.id).join('、')}</span>}
                </span>
                <span className="pkg-mini">
                  <b>{Math.max(p.st.remaining, 0)}</b><span className="muted small">/{p.total} 堂</span>
                  <span className={`pill pkg-${p.st.status}`}>{PACKAGE_STATUS[p.st.status]}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
