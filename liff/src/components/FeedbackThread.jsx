// 意見回饋對話串（客戶與後台共用）
import { fmtSlot } from '../lib/booking'

export default function FeedbackThread({ messages, adminLabel = '宥芯' }) {
  return (
    <ul className="fb-thread">
      {messages.map((m) => (
        <li key={m.id} className={m.from_admin ? 'admin' : ''}>
          <p className="pre-line">{m.body}</p>
          <span className="muted small">{m.from_admin ? `${adminLabel}｜` : ''}{fmtSlot(m.created_at)}</span>
        </li>
      ))}
    </ul>
  )
}
