import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Brandmark } from './ui'
import { NotificationBell, ProfileMenu, usePortal } from './header'
import { customer, pendingPIs, summary } from '../data/mock'
import { rupees } from '../utils/format'

const nav: { group: string; links: { to: string; icon: string; label: string; pill?: number }[] }[] = [
  { group: 'Overview', links: [{ to: '/dashboard', icon: '▦', label: 'Dashboard' }] },
  {
    group: 'Orders',
    links: [
      { to: '/orders/new', icon: '＋', label: 'Create PO' },
      { to: '/orders', icon: '☰', label: 'My Orders' },
    ],
  },
  { group: 'Payments', links: [{ to: '/payments', icon: '₹', label: 'PI & Payments', pill: pendingPIs.length }] },
  { group: 'Deliveries', links: [{ to: '/in-transit', icon: '🚚', label: 'In-Transit', pill: 1 }] },
  { group: 'Accounts', links: [{ to: '/statements', icon: '≣', label: 'Statements' }] },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const { signOut } = usePortal()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // close the mobile drawer whenever the route changes
  useEffect(() => setMenuOpen(false), [pathname])

  return (
    <div className="app">
      {menuOpen && <div className="side-backdrop" onClick={() => setMenuOpen(false)} />}
      <aside className={`side ${menuOpen ? 'open' : ''}`}>
        <div className="brandline">
          <Brandmark />
          <h1>
            Sufalam Portal<small>Customer</small>
          </h1>
        </div>
        <nav className="nav">
          {nav.map((g) => (
            <div key={g.group}>
              <div className="grp">{g.group}</div>
              {g.links.map((l) => (
                <NavLink key={l.to} to={l.to} end className={({ isActive }) => (isActive ? 'on' : '')}>
                  <span className="i">{l.icon}</span>
                  {l.label}
                  {l.pill ? <span className="pill">{l.pill}</span> : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="userbox">
          <div className="avatar">{customer.initials}</div>
          <div>
            <b>{customer.name}</b>
            <small>
              {customer.code} · {customer.state}
            </small>
          </div>
          <button
            className="logout"
            title="Sign out"
            onClick={() => {
              signOut()
              navigate('/login')
            }}
          >
            ⎋
          </button>
        </div>
      </aside>
      <div className="main">
        <AppHeader onMenu={() => setMenuOpen((o) => !o)} />
        <Outlet />
      </div>
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function AppHeader({ onMenu }: { onMenu: () => void }) {
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <header className="app-header">
      <button className="menubtn" title="Menu" onClick={onMenu}>
        ☰
      </button>
      <div className="greet">
        <b>
          {greeting()}, {customer.name}
        </b>
        <small>
          {today} · {customer.code}
        </small>
      </div>
      <span className="spacer" />
      <Link to="/statements" className="credit-chip" title="Available credit">
        <small>Available credit</small>
        <b>{rupees(summary.available)}</b>
      </Link>
      <Link to="/orders/new" className="btn btn-sm hdr-cta">
        ＋ Create PO
      </Link>
      <ProfileMenu />
    </header>
  )
}

export function Topbar({
  title,
  crumb,
  search,
  children,
}: {
  title: string
  crumb: string
  search?: string
  children?: ReactNode
}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  // search hands off to My Orders, which filters by SO / PO number
  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    navigate(q ? `/orders?q=${encodeURIComponent(q)}` : '/orders')
  }

  return (
    <div className="topbar">
      <h2>{title}</h2>
      <span className="crumb">{crumb}</span>
      <span className="spacer" />
      {search && (
        <form onSubmit={onSearch}>
          <input className="search" type="search" placeholder={search} value={query} onChange={(e) => setQuery(e.target.value)} />
        </form>
      )}
      {children ?? <NotificationBell />}
    </div>
  )
}
