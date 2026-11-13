import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { PublicLayout } from '../components/ui'
import { usePortal } from '../components/header'
import { useToast } from '../components/toast'
import { errorMessage } from '../api/client'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, signedIn } = usePortal()
  const toast = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'
  if (signedIn && !busy) return <Navigate to={from} replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const customer = await signIn({ email, password })
      toast.success('Signed in successfully', `Welcome, ${customer.name}.`)
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
        <p className="sub">Sign in with your registered email ID (or SAP user ID) and password.</p>
        <div className="field">
          <label htmlFor="email">Email ID / User ID</label>
          <input
            id="email"
            type="text"
            required
            autoFocus
            autoComplete="username"
            placeholder="accounts@yourcompany.com or manager"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          Already a Sufalam customer? Use <Link to="/forgot-password">Forgot password</Link> with the email ID registered with
          Sufalam to set your password. Your session ends automatically after 30 minutes of inactivity.
        </p>
      </form>
    </PublicLayout>
  )
}
