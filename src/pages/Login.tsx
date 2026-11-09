import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { PublicLayout } from '../components/ui'
import { usePortal } from '../components/header'
import { useToast } from '../components/toast'
import { errorMessage } from '../api/sap'

const DEFAULT_DB = import.meta.env.VITE_SAP_COMPANY_DB || ''

/** Dev-only prefill from .env.local — stripped from production builds by `import.meta.env.DEV`. */
const DEV = import.meta.env.DEV
  ? {
      cardCode: import.meta.env.VITE_DEV_CARD_CODE ?? '',
      userName: import.meta.env.VITE_DEV_SAP_USER ?? '',
      password: import.meta.env.VITE_DEV_SAP_PASSWORD ?? '',
    }
  : { cardCode: '', userName: '', password: '' }

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, signedIn } = usePortal()
  const toast = useToast()

  const [cardCode, setCardCode] = useState(DEV.cardCode)
  const [userName, setUserName] = useState(DEV.userName)
  const [password, setPassword] = useState(DEV.password)
  const [companyDB, setCompanyDB] = useState(DEFAULT_DB)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'
  if (signedIn && !busy) return <Navigate to={from} replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const customer = await signIn({ cardCode, userName: userName.trim(), password, companyDB: companyDB.trim() })
      toast.success('Signed in successfully', `Welcome, ${customer.name}. Connected to SAP (${companyDB.trim()}).`)
      navigate(from, { replace: true })
    } catch (err) {
      const msg = errorMessage(err)
      setError(msg)
      toast.error('Sign-in failed', msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <PublicLayout>
      <form className="auth-card" onSubmit={onSubmit}>
        <h2>Welcome back</h2>
        <p className="sub">Sign in with your SAP Business One credentials.</p>
        <div className="field">
          <label htmlFor="cardCode">Customer code</label>
          <input
            id="cardCode"
            required
            autoFocus
            placeholder="e.g. 20108"
            value={cardCode}
            onChange={(e) => setCardCode(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="userName">User name</label>
          <input
            id="userName"
            required
            autoComplete="username"
            placeholder="SAP user"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="companyDB">Company database</label>
          <input id="companyDB" required value={companyDB} onChange={(e) => setCompanyDB(e.target.value)} />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-grad btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="auth-links">
          <Link to="/forgot-password">Forgot password?</Link>
          <Link to="/register">New customer? Register</Link>
        </div>
        <div className="divider">first time login</div>
        <p className="auth-note">
          Use the temporary password emailed to you after approval. Your session ends automatically after 30 minutes of
          inactivity.
        </p>
      </form>
    </PublicLayout>
  )
}
