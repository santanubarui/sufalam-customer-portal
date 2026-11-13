import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PublicLayout } from '../components/ui'
import { useToast } from '../components/toast'
import { auth, errorMessage } from '../api/client'

type Step = 'email' | 'reset' | 'done'

const MIN_LENGTH = 8

/** Password reset — also used for the first sign-in of existing customers and newly approved registrations. */
export default function ForgotPassword() {
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [resent, setResent] = useState(false)

  const requestCode = async () => {
    setError('')
    setBusy(true)
    try {
      const r = await auth.forgotPassword(email.trim())
      setNotice(r.message)
      return true
    } catch (err) {
      const msg = errorMessage(err)
      setError(msg)
      toast.error('Could not send the code', msg)
      return false
    } finally {
      setBusy(false)
    }
  }

  const sendCode = async (e: FormEvent) => {
    e.preventDefault()
    if (await requestCode()) setStep('reset')
  }

  const resend = async () => {
    setOtp('')
    if (await requestCode()) {
      setResent(true)
      toast.info('Code resent', 'Check your inbox (and spam folder) for the new code.')
    }
  }

  const resetPassword = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(otp)) return setError('Enter the 6-digit code sent to your email.')
    if (password.length < MIN_LENGTH) return setError(`Password must be at least ${MIN_LENGTH} characters.`)
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return setError('Password must contain letters and numbers.')
    if (password !== confirm) return setError('Passwords do not match.')
    setError('')
    setBusy(true)
    try {
      await auth.resetPassword(email.trim(), otp, password)
      toast.success('Password set', 'You can now sign in with your new password.')
      setStep('done')
    } catch (err) {
      const msg = errorMessage(err)
      setError(msg)
      toast.error('Could not set the password', msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <PublicLayout>
      {step === 'email' && (
        <form className="auth-card" onSubmit={sendCode}>
          <h2>Forgot password?</h2>
          <p className="sub">
            Enter your registered email ID and we'll send you a 6-digit verification code. First time here? Use the email
            ID registered with Sufalam to set up your login.
          </p>
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
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-grad btn-block" disabled={busy}>
            {busy ? 'Sending…' : 'Send verification code'}
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
            {notice || <>We sent a code to <b>{email}</b>.</>}{' '}
            <button type="button" className="linkbtn" onClick={() => setStep('email')}>
              Change email
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
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-grad btn-block" disabled={busy}>
            {busy ? 'Saving…' : 'Set password'}
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

      {step === 'done' && (
        <div className="auth-card">
          <div className="auth-success">✓</div>
          <h2>Password updated</h2>
          <p className="sub">Your password has been set. Sign in with your email ID and new password to continue.</p>
          <button className="btn btn-grad btn-block" onClick={() => navigate('/login')}>
            Back to sign in
          </button>
        </div>
      )}
    </PublicLayout>
  )
}
