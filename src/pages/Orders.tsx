import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { NotificationBell } from '../components/header'
import { Card, DateChip, Tag } from '../components/ui'
import { orders, statusTone, type OrderStatus } from '../data/mock'
import { rupees } from '../utils/format'

const filters: (OrderStatus | 'All')[] = ['All', 'Awaiting approval', 'Confirmed', 'PI raised', 'In-Transit', 'Delivered']

export default function Orders() {
  const [filter, setFilter] = useState<OrderStatus | 'All'>('All')
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')

  const q = query.trim().toLowerCase()
  const rows = orders.filter(
    (o) =>
      (filter === 'All' || o.status === filter) &&
      (!q || o.po.toLowerCase().includes(q) || (o.so ?? '').toLowerCase().includes(q)),
  )

  return (
    <>
      <div className="topbar">
        <h2>My Orders</h2>
        <span className="crumb">Orders / All</span>
        <span className="spacer" />
        <input className="search" placeholder="Search SO or PO number…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <NotificationBell />
      </div>
      <div className="content">
        <div className="btn-row mb" style={{ marginTop: 0, flexWrap: 'wrap', gap: '.5rem' }}>
          {filters.map((f) => {
            const count = f === 'All' ? orders.length : orders.filter((o) => o.status === f).length
            return (
              <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(f)}>
                {f} ({count})
              </button>
            )
          })}
        </div>

        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SAP SO No.</th>
                  <th>Your PO</th>
                  <th>Item summary</th>
                  <th className="num">Value</th>
                  <th>Delivery terms</th>
                  <th className="th-exp">Your expected date</th>
                  <th>Confirmed by SIL</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.po}>
                    <td>{o.so ? <b>{o.so}</b> : <span className="muted">pending</span>}</td>
                    <td>
                      {o.po}{' '}
                      <a href="#" title="PO copy">
                        📎
                      </a>
                    </td>
                    <td>
                      {o.item} · {o.qty}
                    </td>
                    <td className="num">{rupees(o.value)}</td>
                    <td>{o.terms}</td>
                    <td>
                      <DateChip kind="exp" value={o.expected} />
                    </td>
                    <td>
                      <DateChip kind="conf" value={o.confirmed} />
                    </td>
                    <td>
                      <Tag tone={statusTone[o.status]}>{o.status}</Tag>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="muted" style={{ textAlign: 'center' }}>
                      No orders match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="footer-note">
          Purple = your expected date · Green = date confirmed by Sufalam. You receive an email whenever a confirmed date
          is set or revised.
        </p>
      </div>
    </>
  )
}
