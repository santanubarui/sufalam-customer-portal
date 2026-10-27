import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { attention, customer } from '../data/mock'
import { rupees } from '../utils/format'

/* ===== session + notification state shared by every header ===== */

const SESSION_KEY = 'sufalam.signedIn'

const readSession = () => {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

const Portal = createContext<{
  signedIn: boolean
  signIn: () => void
  signOut: () => void
  unread: number
  markAllRead: () => void
} | null>(null)

export function PortalProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(readSession)
  const [unread, setUnread] = useState(attention.length)

  const persist = (v: boolean) => {
    setSignedIn(v)
    try {
      v ? sessionStorage.setItem(SESSION_KEY, '1') : sessionStorage.removeItem(SESSION_KEY)
    } catch {
      /* storage blocked — state still works for this tab */
    }
  }

  return (
    <Portal.Provider
      value={{
        signedIn,
        signIn: () => persist(true),
        signOut: () => {
          persist(false)
          setUnread(attention.length)
        },
        unread,
        markAllRead: () => setUnread(0),
      }}
    >
      {children}
    </Portal.Provider>
  )
}

export function usePortal() {
  const ctx = useContext(Portal)
  if (!ctx) throw new Error('usePortal must be used inside <PortalProvider>')
  return ctx
}

/** Open/close state for a dropdown that closes on outside click or Escape. */
function useDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return { open, setOpen, ref, close: () => setOpen(false) }
}

/* ===== profile section (avatar + dropdown) ===== */

export function ProfileMenu({ variant = 'light', showName = false }: { variant?: 'light' | 'dark'; showName?: boolean }) {
  const { signedIn, signOut } = usePortal()
  const navigate = useNavigate()
  const dd = useDropdown()

  const onSignOut = () => {
    dd.close()
    signOut()
    navigate('/login')
  }

  return (
    <div className={`dd profile ${variant}`} ref={dd.ref}>
      <button className="profile-btn" onClick={() => dd.setOpen((o) => !o)} aria-expanded={dd.open}>
        <span className={`avatar ${signedIn ? '' : 'guest'}`}>{signedIn ? customer.initials : '👤'}</span>
        {showName && (
          <span className="profile-name">
            <b>{signedIn ? customer.name : 'Guest'}</b>
            <small>{signedIn ? `${customer.code} · ${customer.state}` : 'Not signed in'}</small>
          </span>
        )}
        <span className="caret">▾</span>
      </button>

      {dd.open && (
        <div className="dd-menu">
          {signedIn ? (
            <>
              <div className="dd-head">
                <span className="avatar">{customer.initials}</span>
                <div>
                  <b>{customer.name}</b>
                  <small>
                    {customer.code} · {customer.state}
                  </small>
                </div>
              </div>
              <Link to="/dashboard" onClick={dd.close}>
                ▦ Dashboard
              </Link>
              <Link to="/orders" onClick={dd.close}>
                ☰ My Orders
              </Link>
              <Link to="/statements" onClick={dd.close}>
                ≣ Account statement
              </Link>
              <div className="dd-sep" />
              <button className="danger" onClick={onSignOut}>
                ⎋ Sign out
              </button>
            </>
          ) : (
            <>
              <div className="dd-head">
                <span className="avatar guest">👤</span>
                <div>
                  <b>Welcome to Sufalam</b>
                  <small>Sign in or create an account</small>
                </div>
              </div>
              <Link to="/login" onClick={dd.close}>
                → Sign in
              </Link>
              <Link to="/register" onClick={dd.close}>
                ＋ New customer? Register
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ===== notifications bell ===== */

export function NotificationBell() {
  const { unread, markAllRead } = usePortal()
  const dd = useDropdown()

  return (
    <div className="dd" ref={dd.ref}>
      <button className="iconbtn" title="Notifications" onClick={() => dd.setOpen((o) => !o)} aria-expanded={dd.open}>
        🔔{unread > 0 && <span className="dot" />}
      </button>
      {dd.open && (
        <div className="dd-menu notif">
          <div className="dd-title">
            <b>Notifications</b>
            <span className="spacer" />
            {unread > 0 ? (
              <button className="linkbtn" onClick={markAllRead}>
                Mark all read
              </button>
            ) : (
              <small className="muted">All caught up</small>
            )}
          </div>
          <ul className="mini-list">
            {attention.map((a) => (
              <li key={a.title} className={unread ? 'unread' : ''}>
                <span className="bdot" style={{ background: a.color }} />
                <div>
                  <b>{a.title}</b>
                  {a.amount ? ` — ${rupees(a.amount)}` : ''}
                  <small>{a.note}</small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
