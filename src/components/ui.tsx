import type { ReactNode } from 'react'
import type { TagTone } from '../data/mock'

export function Brandmark() {
  return (
    <div className="brandmark">
      <span>S</span>
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
