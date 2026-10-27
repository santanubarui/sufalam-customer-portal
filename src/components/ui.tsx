import type { ReactNode } from 'react'
import type { TagTone } from '../data/mock'

export function Brandmark() {
  return (
    <div className="brandmark">
      <span>S</span>
    </div>
  )
}

/** Split public screen (sign in, forgot password): brand hero on the left, form panel on the right. */
export function PublicLayout({ children }: { children: ReactNode }) {
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

      <div className="public-panel">{children}</div>
    </div>
  )
}

export function Tag({ tone, children }: { tone: TagTone; children: ReactNode }) {
  return <span className={`tag ${tone}`}>{children}</span>
}

export function Tile({
  label,
  value,
  detail,
  tone = '',
  detailTone = '',
}: {
  label: string
  value: ReactNode
  detail: ReactNode
  tone?: '' | 'p' | 'a' | 'r'
  detailTone?: '' | 'up' | 'warn'
}) {
  return (
    <div className={`tile ${tone}`}>
      <small>{label}</small>
      <div className="v">{value}</div>
      <div className={`d ${detailTone}`}>{detail}</div>
    </div>
  )
}

/** Purple = customer's expected date · Green = date confirmed by Sufalam */
export function DateChip({ kind, value }: { kind: 'exp' | 'conf'; value: string | null }) {
  if (!value) return <span className={`dchip ${kind} pending`}>pending</span>
  return <span className={`dchip ${kind}`}>{value}</span>
}

export function Card({
  title,
  actions,
  className = '',
  children,
}: {
  title?: ReactNode
  actions?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`card ${className}`}>
      {title && (
        <div className="hd">
          <h3>{title}</h3>
          <span className="spacer" />
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}
