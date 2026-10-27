import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PublicLayout } from '../components/ui'
import { usePortal } from '../components/header'

export default function Login() {
  const navigate = useNavigate()
  const { signIn } = usePortal()

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    signIn()
    navigate('/dashboard')
  }

  return (
    <PublicLayout>
      <form className="auth-card" onSubmit={onSubmit}>
        <h2>Welcome back</h2>
        <p className="sub">Sign in with your registered email ID.</p>
        <div className="field">
          <label htmlFor="email">Email ID</label>
          <input id="email" type="email" required placeholder="accounts@yourcompany.com" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" required placeholder="••••••••" />
        </div>
        <button type="submit" className="btn btn-grad btn-block">
          Sign in
        </button>
        <div className="auth-links">
          <Link to="/forgot-password">Forgot password?</Link>
          <Link to="/register">New customer? Register</Link>
        </div>
        <div className="divider">first time login</div>
        <p className="auth-note">
          Use the temporary password emailed to you after approval. You will be asked to set a new password on first
          sign-in.
        </p>
      </form>
    </PublicLayout>
  )
}
