import { useState, type FormEvent } from 'react'
import { Topbar } from '../components/AppLayout'
import { Card } from '../components/ui'
import { useToast } from '../components/toast'
import { auth, errorMessage } from '../api/client'

const MIN_LENGTH = 8

/** Change password for the signed-in user (DTS Api/user_rep/ChangePassword). */
export default function ChangePassword() {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!current) return setError('Enter your current password.')
    if (password.length < MIN_LENGTH) return setError(`Password must be at least ${MIN_LENGTH} characters.`)
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return setError('Password must contain letters and numbers.')
    if (password !== confirm) return setError('Passwords do not match.')
    if (password === current) return setError('The new password must be different from the current one.')
    setError('')
    setBusy(true)
    try {
      const r = await auth.changePassword(current, password, confirm)
      toast.success('Password changed', r.message)
      setCurrent('')
      setPassword('')
      setConfirm('')
    } catch (err) {
      const msg = errorMessage(err)
      setError(msg)
      toast.error('Could not change the password', msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Topbar title="Change password" crumb="Account" />
      <div className="content">
        <Card title="Change password">
          <form className="bd" onSubmit={onSubmit} noValidate style={{ maxWidth: 420 }}>
            <div className="field">
              <label htmlFor="cp-old">Current password</label>
              <input
                id="cp-old"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="cp-new">New password</label>
              <input
                id="cp-new"
                type="password"
                autoComplete="new-password"
                placeholder={`At least ${MIN_LENGTH} characters, letters and numbers`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="cp-confirm">Confirm new password</label>
              <input
                id="cp-confirm"
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
            <button type="submit" className="btn btn-grad" disabled={busy}>
              {busy ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </Card>
      </div>
    </>
  )
}
