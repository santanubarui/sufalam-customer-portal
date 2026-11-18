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
  const [showPassword, setShowPassword] = useState(false)
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
        <p className="sub">Sign in with your Sufalam user code (or registered email ID) and password.</p>
        <div className="field">
          <label htmlFor="email">User code / Email ID</label>
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
          <div className="password-input">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
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
