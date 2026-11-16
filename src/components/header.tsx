import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Customer } from '../api/portal'
import {
  auth,
  errorMessage,
  getCustomer,
  getDeliveries,
  getOpenInvoices,
  getPendingProformas,
  onSessionExpired,
  type PortalUser,
} from '../api/client'
import { dtsUserLogIn, dtsUserLogOut } from '../api/dts'
import { rupees } from '../utils/format'
import { useToast } from './toast'

/* ===== session + notification state shared by every header ===== */

export interface SignInInput {
  email: string
  password: string
}

export interface Alert {
  color: string
  title: string
  amount?: number
  note: string
  to: string
}

interface PortalState {
  signedIn: boolean
  /** true while the existing session cookie is being checked on page load */
  checking: boolean
  session: PortalUser | null
  customer: Customer | null
  customerLoading: boolean
  customerError: string | null
  signIn: (input: SignInInput) => Promise<{ name: string }>
  signOut: () => Promise<void>
  refreshCustomer: () => void
  alerts: Alert[]
  counts: { pis: number; inTransit: number; overdue: number }
  refreshAlerts: () => void
  unread: number
  markAllRead: () => void
}

const Portal = createContext<PortalState | null>(null)

async function loadAlerts() {
  const [pis, deliveries, invoices] = await Promise.all([getPendingProformas(), getDeliveries(), getOpenInvoices()])
  const overdue = invoices.filter((i) => i.daysOverdue > 0)
  const alerts: Alert[] = []
  pis.forEach((p) =>
    alerts.push({ color: 'var(--purple-600)', title: `${p.pi} ready for payment`, amount: p.amount, note: `Against ${p.ref}`, to: '/payments' }),
  )
  deliveries.inTransit.forEach((d) =>
    alerts.push({ color: 'var(--green-600)', title: `${d.dn} in transit`, note: `${d.item} · ${d.qty} · acknowledge on receipt`, to: '/in-transit' }),
  )
  if (overdue.length) {
    alerts.push({
      color: 'var(--red)',
      title: `${overdue.length} invoice${overdue.length > 1 ? 's' : ''} overdue`,
      amount: overdue.reduce((s, i) => s + i.balance, 0),
      note: `Oldest ${Math.max(...overdue.map((i) => i.daysOverdue))} days past due date`,
      to: '/statements',
    })
  }
  return { alerts, counts: { pis: pis.length, inTransit: deliveries.inTransit.length, overdue: overdue.length } }
}

export function PortalProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [session, setSession] = useState<PortalUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerLoading, setCustomerLoading] = useState(false)
  const [customerError, setCustomerError] = useState<string | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [counts, setCounts] = useState({ pis: 0, inTransit: 0, overdue: 0 })
  const [unread, setUnread] = useState(0)

  const clear = useCallback(() => {
    setSession(null)
    setCustomer(null)
    setCustomerError(null)
    setAlerts([])
    setCounts({ pis: 0, inTransit: 0, overdue: 0 })
    setUnread(0)
  }, [])

  // restore the session after a page reload (HttpOnly cookie held by the browser)
  useEffect(() => {
    const ctrl = new AbortController()
    auth
      .me(ctrl.signal)
      .then((r) => setSession(r.user))
      .catch(() => undefined)
      .finally(() => !ctrl.signal.aborted && setChecking(false))
    return () => ctrl.abort()
  }, [])

  // Any 401 from the portal API ends the session.
  const sessionRef = useRef(session)
  sessionRef.current = session
  useEffect(() => {
    onSessionExpired(() => {
      if (!sessionRef.current) return
      clear()
      toast.error('Session expired', 'You were signed out after a period of inactivity. Please sign in again.')
    })
    return () => onSessionExpired(null)
  }, [clear, toast])

  const refreshCustomer = useCallback(() => {
    if (!session) return
    setCustomerLoading(true)
    setCustomerError(null)
    getCustomer()
      .then(setCustomer)
      .catch((e) => setCustomerError(errorMessage(e)))
      .finally(() => setCustomerLoading(false))
  }, [session])

  useEffect(() => {
    if (session && !customer) refreshCustomer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const refreshAlerts = useCallback(() => {
    if (!session) return
    loadAlerts()
      .then((r) => {
        setAlerts(r.alerts)
        setCounts(r.counts)
        setUnread(r.alerts.length)
      })
      .catch(() => {
        /* alerts are secondary — pages show their own errors */
      })
  }, [session])

  useEffect(() => {
    if (customer) refreshAlerts()
  }, [customer, refreshAlerts])

  const signIn = useCallback(async (input: SignInInput) => {
    // 1. DTS API straight from the browser (shows in the Network tab, like the DTS web app)
    await dtsUserLogIn(input.email.trim(), input.password)
    // 2. portal backend: checks the same login again, then opens the portal session
    const r = await auth.login(input.email.trim(), input.password)
    // customer is null when SAP was not reachable at sign-in; the effect below loads it (with Retry on error)
    setCustomer(r.customer)
    setCustomerError(null)
    setCustomerLoading(false)
    setSession(r.user)
    return { name: r.customer?.name || r.user.name }
  }, [])

  const signOut = useCallback(async () => {
    await Promise.all([auth.logout(), dtsUserLogOut()])
    clear()
  }, [clear])

  return (
    <Portal.Provider
      value={{
        signedIn: !!session,
        checking,
        session,
        customer,
        customerLoading,
        customerError,
        signIn,
        signOut,
        refreshCustomer,
        alerts,
        counts,
        refreshAlerts,
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

/** For pages rendered inside AppLayout, where the customer is guaranteed to be loaded. */
export function useCustomer() {
  const { customer } = usePortal()
  if (!customer) throw new Error('useCustomer used before the customer was loaded')
  return customer
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

/** Signs out of SAP, shows the result and returns to the login screen. */
export function useSignOut() {
  const { signOut } = usePortal()
  const toast = useToast()
  const navigate = useNavigate()
  return async () => {
    await signOut()
    toast.success('Signed out', 'You have been signed out of the portal.')
    navigate('/login')
  }
}

/* ===== profile section (avatar + dropdown) ===== */

export function ProfileMenu({ variant = 'light', showName = false }: { variant?: 'light' | 'dark'; showName?: boolean }) {
  const { signedIn, customer, session } = usePortal()
  const signOut = useSignOut()
  const dd = useDropdown()

  const onSignOut = () => {
    dd.close()
    void signOut()
  }

  const name = customer?.name ?? session?.cardCode ?? 'Guest'
  const sub = customer ? `${customer.code}${customer.state ? ` · ${customer.state}` : ''}` : 'Not signed in'
  const initials = customer?.initials ?? '…'

  return (
    <div className={`dd profile ${variant}`} ref={dd.ref}>
      <button className="profile-btn" onClick={() => dd.setOpen((o) => !o)} aria-expanded={dd.open}>
        <span className={`avatar ${signedIn ? '' : 'guest'}`}>{signedIn ? initials : '👤'}</span>
        {showName && (
          <span className="profile-name">
            <b>{signedIn ? name : 'Guest'}</b>
            <small>{signedIn ? sub : 'Not signed in'}</small>
          </span>
        )}
        <span className="caret">▾</span>
      </button>

      {dd.open && (
        <div className="dd-menu">
          {signedIn ? (
            <>
              <div className="dd-head">
                <span className="avatar">{initials}</span>
                <div>
                  <b>{name}</b>
                  <small>
                    {sub}
                    {session ? ` · ${session.email}` : ''}
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
              <Link to="/change-password" onClick={dd.close}>
                🔒 Change password
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
  const { unread, markAllRead, alerts } = usePortal()
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
            {alerts.length === 0 && (
              <li>
                <div>
                  <small>Nothing needs your attention right now.</small>
                </div>
              </li>
            )}
            {alerts.map((a) => (
              <li key={a.title} className={unread ? 'unread' : ''}>
                <span className="bdot" style={{ background: a.color }} />
                <div>
                  <Link to={a.to} onClick={dd.close}>
                    <b>{a.title}</b>
                  </Link>
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
