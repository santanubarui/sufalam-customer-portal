import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { NotificationBell, useCustomer } from '../components/header'
import { Async, Card, DateChip, EmptyRow, Tag } from '../components/ui'
import { getOrders, statusTone, type OrderStatus } from '../api/portal'
import { useAsync } from '../hooks/useAsync'
import { rupees } from '../utils/format'

const filters: (OrderStatus | 'All')[] = ['All', 'Awaiting approval', 'Open', 'Closed', 'Cancelled']

export default function Orders() {
  const customer = useCustomer()
  const [filter, setFilter] = useState<OrderStatus | 'All'>('All')
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')

  const state = useAsync((signal) => getOrders(customer.code, signal), [customer.code])
  const orders = state.data ?? []

  const q = query.trim().toLowerCase()
  const rows = orders.filter(
    (o) =>
      (filter === 'All' || o.status === filter) &&
      (!q || o.po.toLowerCase().includes(q) || (o.so ?? '').toLowerCase().includes(q) || o.item.toLowerCase().includes(q)),
  )

  return (
    <>
      <div className="topbar">
        <h2>My Orders</h2>
        <span className="crumb">Orders / All</span>
        <span className="spacer" />
        <input className="search" placeholder="Search SO or PO number…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn btn-ghost btn-sm" onClick={state.reload} disabled={state.loading}>
          {state.loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
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

        <Async state={state} label="Loading your orders from SAP…">
          {() => (
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
                      <tr key={o.key}>
                        <td>{o.so ? <b>{o.so}</b> : <span className="muted">pending</span>}</td>
                        <td>
                          {o.po} {o.hasAttachment && <span title="PO copy attached in SAP">📎</span>}
                        </td>
                        <td>
                          {o.item}
                          {o.qty ? ` · ${o.qty}` : ''}
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
                    {rows.length === 0 && <EmptyRow cols={8}>{orders.length ? 'No orders match.' : 'No orders found in SAP yet.'}</EmptyRow>}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </Async>
        <p className="footer-note">
          Purple = your expected date · Green = date confirmed by Sufalam. Orders "awaiting approval" are drafts in SAP until
          Sufalam converts them to a Sales Order.
        </p>
      </div>
    </>
  )
}
