import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brandmark } from '../components/ui'
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
    <div className="public-wrap">
      <div className="public-hero">
        <div className="brandline">
          <Brandmark />
          <h1>
            Sufalam Industries Limited<small>Customer Portal</small>
          </h1>
        </div>
        <div className="pitch">
          <h2>Order, pay &amp; track — all in one place.</h2>
          <p>
            Upload purchase orders, get confirmed delivery dates, pay proforma invoices online and view your live
            outstanding — connected in real time with Sufalam's SAP Business One.
          </p>
          <div className="hero-steps">
            <div>
              <b>01</b>Register &amp; get approved
            </div>
            <div>
              <b>02</b>Upload your PO
            </div>
            <div>
              <b>03</b>Pay &amp; track delivery
            </div>
          </div>
        </div>
        <footer>Powered by SAS Infosystem Pvt. Ltd. · SAP Business One HANA</footer>
      </div>

      <div className="public-panel">
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
            <a href="#">Forgot password?</a>
            <Link to="/register">New customer? Register</Link>
          </div>
          <div className="divider">first time login</div>
          <p className="auth-note">
            Use the temporary password emailed to you after approval. You will be asked to set a new password on first
            sign-in.
          </p>
        </form>
      </div>
    </div>
  )
}
