// 訂單進度卡：五個狀態的步驟條，已完成的步驟顯示日期
import { PRODUCTS, STATUSES, statusIndex, statusTimes } from '../lib/orders'
import { fmtDate } from '../lib/format'

export default function OrderCard({ order, children }) {
  const cur = statusIndex(order.status)
  const times = statusTimes(order.events)
  return (
    <section className="card order-card">
      <div className="scale-card-head">
        <h2>{PRODUCTS[order.product_type] ?? order.product_type}</h2>
        <span className={`tag ${order.status === 'ready' ? 'ok' : ''}`}>{STATUSES[cur]?.label ?? order.status}</span>
      </div>
      <p className="muted small">{STATUSES[cur]?.desc}</p>
      <ol className="order-steps">
        {STATUSES.map((s, i) => (
          <li key={s.key} className={i < cur ? 'done' : i === cur ? 'current' : ''}>
            <span className="dot" aria-hidden="true" />
            <span className="label">{s.label}</span>
            {times[s.key] && i <= cur && <span className="when">{fmtDate(times[s.key]).slice(5)}</span>}
          </li>
        ))}
      </ol>
      {order.note && <p className="small note">備註：{order.note}</p>}
      {children}
    </section>
  )
}
