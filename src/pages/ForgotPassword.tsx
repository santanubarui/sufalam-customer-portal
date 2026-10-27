import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PublicLayout } from '../components/ui'

type Step = 'email' | 'reset' | 'done'

const MIN_LENGTH = 8

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [resent, setResent] = useState(false)

  const sendCode = (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setStep('reset')
  }

  const resetPassword = (e: FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(otp)) return setError('Enter the 6-digit code sent to your email.')
    if (password.length < MIN_LENGTH) return setError(`Password must be at least ${MIN_LENGTH} characters.`)
    if (password !== confirm) return setError('Passwords do not match.')
    setError('')
    setStep('done')
  }

  const resend = () => {
    setOtp('')
    setResent(true)
  }

  return (
    <PublicLayout>
      {step === 'email' && (
        <form className="auth-card" onSubmit={sendCode}>
          <h2>Forgot password?</h2>
          <p className="sub">Enter your registered email ID and we'll send you a 6-digit verification code.</p>
          <div className="field">
            <label htmlFor="fp-email">Email ID</label>
            <input
              id="fp-email"
              type="email"
              required
              autoFocus
              placeholder="accounts@yourcompany.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-grad btn-block">
            Send verification code
          </button>
          <div className="auth-links">
            <Link to="/login">← Back to sign in</Link>
          </div>
          <div className="divider">need help?</div>
          <p className="auth-note">
            If you no longer have access to your registered email, contact your Sufalam sales representative to update
            it.
          </p>
        </form>
      )}

      {step === 'reset' && (
        <form className="auth-card" onSubmit={resetPassword} noValidate>
          <h2>Set a new password</h2>
          <p className="sub">
            We sent a code to <b>{email}</b>.{' '}
            <button type="button" className="linkbtn" onClick={() => setStep('email')}>
              Change
            </button>
          </p>
          <div className="field">
            <label htmlFor="fp-otp">Verification code</label>
            <input
              id="fp-otp"
              className="otp-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              placeholder="••••••"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className="field">
            <label htmlFor="fp-new">New password</label>
            <input
              id="fp-new"
              type="password"
              autoComplete="new-password"
              placeholder={`At least ${MIN_LENGTH} characters`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="fp-confirm">Confirm new password</label>
            <input
              id="fp-confirm"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-grad btn-block">
            Reset password
          </button>
          <div className="auth-links">
            <Link to="/login">← Back to sign in</Link>
            {resent ? (
              <span className="muted">Code resent ✓</span>
            ) : (
              <button type="button" className="linkbtn" onClick={resend}>
                Resend code
              </button>
            )}
          </div>
        </form>
      )}

      {step === 'done' && (
        <div className="auth-card">
          <div className="auth-success">✓</div>
          <h2>Password updated</h2>
          <p className="sub">Your password has been reset. Sign in with your new password to continue.</p>
          <button className="btn btn-grad btn-block" onClick={() => navigate('/login')}>
            Back to sign in
          </button>
        </div>
      )}
    </PublicLayout>
  )
}
