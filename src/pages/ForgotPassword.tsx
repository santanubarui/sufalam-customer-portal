import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PublicLayout } from '../components/ui'
import { useToast } from '../components/toast'
import { dtsPassword, errorMessage } from '../api/client'

type Step = 'request' | 'otp' | 'reset' | 'done'

const MIN_LENGTH = 8

/**
 * Password reset through the DTS Sufalam API:
 *   1. user code + email  → Api/Auth/ForgotPassword (code emailed)
 *   2. verification code  → Api/Auth/OTPcheck
 *   3. new password       → Api/Auth/UpdatePass
 */
export default function ForgotPassword() {
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const [step, setStep] = useState<Step>('request')
  const [userCode, setUserCode] = useState(params.get('code') ?? '')
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [resent, setResent] = useState(false)

  /** Runs one API step with shared busy / error handling; returns false when it failed. */
  const run = async (title: string, fn: () => Promise<{ message: string }>) => {
    setError('')
    setBusy(true)
    try {
      const r = await fn()
      setNotice(r.message)
      return true
    } catch (err) {
      const msg = errorMessage(err)
      setError(msg)
      toast.error(title, msg)
      return false
    } finally {
      setBusy(false)
    }
  }

  const requestCode = () => run('Could not send the code', () => dtsPassword.forgot(userCode.trim(), email.trim()))

  const sendCode = async (e: FormEvent) => {
    e.preventDefault()
    if (!userCode.trim()) return setError('Enter your user code.')
    if (await requestCode()) {
      setOtp('')
      setResent(false)
      setStep('otp')
    }
  }

  const resend = async () => {
    setOtp('')
    if (await requestCode()) {
      setResent(true)
      toast.info('Code resent', 'Check your inbox (and spam folder) for the new code.')
    }
  }

  const verifyCode = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^[A-Za-z0-9]{4,12}$/.test(otp.trim())) return setError('Enter the verification code sent to your email.')
    if (await run('Code not accepted', () => dtsPassword.checkOtp(userCode.trim(), email.trim(), otp.trim()))) setStep('reset')
  }

  const updatePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < MIN_LENGTH) return setError(`Password must be at least ${MIN_LENGTH} characters.`)
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return setError('Password must contain letters and numbers.')
    if (password !== confirm) return setError('Passwords do not match.')
    const ok = await run('Could not update the password', () =>
      dtsPassword.update(userCode.trim(), email.trim(), otp.trim(), password, confirm),
    )
    if (ok) {
      toast.success('Password updated', 'You can now sign in with your new password.')
      setStep('done')
    }
  }

  const errorLine = error && (
    <p className="form-error" role="alert">
      {error}
    </p>
  )

  return (
    <PublicLayout>
      {step === 'request' && (
        <form className="auth-card" onSubmit={sendCode}>
          <h2>Forgot password?</h2>
          <p className="sub">Enter your user code and registered email ID, and we'll email you a verification code.</p>
          <div className="field">
            <label htmlFor="fp-code">User code</label>
            <input
              id="fp-code"
              required
              autoFocus
              autoComplete="username"
              placeholder="Your portal user code"
              value={userCode}
              onChange={(e) => setUserCode(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="fp-email">Email ID</label>
            <input
              id="fp-email"
              type="email"
              required
              autoComplete="email"
              placeholder="accounts@yourcompany.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {errorLine}
          <button type="submit" className="btn btn-grad btn-block" disabled={busy}>
            {busy ? 'Sending…' : 'Send verification code'}
          </button>
          <div className="auth-links">
            <Link to="/login">← Back to sign in</Link>
          </div>
          <div className="divider">need help?</div>
          <p className="auth-note">
            If you don't know your user code or no longer have access to your registered email, contact your Sufalam sales
            representative.
          </p>
        </form>
      )}

      {step === 'otp' && (
        <form className="auth-card" onSubmit={verifyCode} noValidate>
          <h2>Enter verification code</h2>
          <p className="sub">
            {notice || <>We sent a code to <b>{email}</b>.</>}{' '}
            <button type="button" className="linkbtn" onClick={() => setStep('request')}>
              Change details
            </button>
          </p>
          <div className="field">
            <label htmlFor="fp-otp">Verification code</label>
            <input
              id="fp-otp"
              className="otp-input"
              autoComplete="one-time-code"
              maxLength={12}
              autoFocus
              placeholder="••••••"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
            />
          </div>
          {errorLine}
          <button type="submit" className="btn btn-grad btn-block" disabled={busy}>
            {busy ? 'Checking…' : 'Verify code'}
          </button>
          <div className="auth-links">
            <Link to="/login">← Back to sign in</Link>
            {resent ? (
              <span className="muted">Code resent ✓</span>
            ) : (
              <button type="button" className="linkbtn" onClick={() => void resend()} disabled={busy}>
                Resend code
              </button>
            )}
          </div>
        </form>
      )}

      {step === 'reset' && (
        <form className="auth-card" onSubmit={updatePassword} noValidate>
          <h2>Set a new password</h2>
          <p className="sub">Code verified for <b>{email}</b>. Choose a new password.</p>
          <div className="field">
            <label htmlFor="fp-new">New password</label>
            <input
              id="fp-new"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder={`At least ${MIN_LENGTH} characters, letters and numbers`}
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
          {errorLine}
          <button type="submit" className="btn btn-grad btn-block" disabled={busy}>
            {busy ? 'Saving…' : 'Update password'}
          </button>
          <div className="auth-links">
            <Link to="/login">← Back to sign in</Link>
          </div>
        </form>
      )}

      {step === 'done' && (
        <div className="auth-card">
          <div className="auth-success">✓</div>
          <h2>Password updated</h2>
          <p className="sub">{notice || 'Your password has been updated.'} Sign in with your new password to continue.</p>
          <button className="btn btn-grad btn-block" onClick={() => navigate('/login')}>
            Back to sign in
          </button>
        </div>
      )}
    </PublicLayout>
  )
}
