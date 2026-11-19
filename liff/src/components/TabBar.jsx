import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/', label: '衛教', icon: 'M4 5h16v14H4z M8 9h8 M8 13h5' },
  { to: '/scales', label: '量表', icon: 'M6 4h12v16H6z M9 8h6 M9 12h6 M9 16h3' },
  { to: '/foot', label: '足部', icon: 'M9 21c-3 0-4-3-4-6 0-4 2-9 5-9s4 3 4 6-1 4-1 6 0 3-4 3z M15 5a1.5 1.5 0 1 0 0-.1 M18 8a1.2 1.2 0 1 0 0-.1' },
  { to: '/me', label: '我的', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c1-4 4-6 8-6s7 2 8 6' },
]

export default function TabBar() {
  return (
    <nav className="tabbar" aria-label="主要分頁">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'} className="tab">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={t.icon} />
          </svg>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
