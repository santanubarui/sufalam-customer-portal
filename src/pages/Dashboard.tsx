import { Link } from 'react-router-dom'
import { Topbar } from '../components/AppLayout'
import { Async, Card, DateChip, EmptyRow, Tag, Tile } from '../components/ui'
import { useCustomer, usePortal } from '../components/header'
import { statusTone, todayIso } from '../api/portal'
import { getOpenInvoices, getOrders, getPayments } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { fmtDate, rupees } from '../utils/format'

export default function Dashboard() {
  const customer = useCustomer()
  const { alerts } = usePortal()

  const state = useAsync(
    async (signal) => {
      const [orders, invoices, payments] = await Promise.all([
        getOrders(signal),
        getOpenInvoices(signal),
        getPayments(signal),
      ])
      return { orders, invoices, payments }
    },
    [customer.code],
  )

  return (
    <>
      <Topbar title="Dashboard" crumb="Home / Overview" search="Search order, invoice, PI…" />
      <div className="content">
        <Async state={state}>
          {({ orders, invoices, payments }) => {
            const overdue = invoices.filter((i) => i.daysOverdue > 0)
            const advances = payments.filter((p) => p.onAccount && !p.cancelled)
            const open = orders.filter((o) => o.status === 'Open')
            const awaiting = orders.filter((o) => o.status === 'Awaiting approval')
            const recent = orders.filter((o) => o.status === 'Open' || o.status === 'Awaiting approval').slice(0, 5)

            return (
              <>
                <div className="tiles">
                  <Tile label="Total outstanding" value={rupees(customer.balance)} detail={`as on ${fmtDate(todayIso())}`} />
                  <Tile
                    tone="r"
                    label="Overdue"
                    value={rupees(overdue.reduce((s, i) => s + i.balance, 0))}
                    detail={`${overdue.length} invoice${overdue.length === 1 ? '' : 's'} past due`}
                    detailTone={overdue.length ? 'warn' : ''}
                  />
                  <Tile tone="p" label="Available credit" value={rupees(customer.available)} detail={`limit ${rupees(customer.creditLimit)}`} detailTone="up" />
                  <Tile
                    label="Advances"
                    value={rupees(advances.reduce((s, p) => s + p.amount, 0))}
                    detail={`${advances.length} on-account receipt${advances.length === 1 ? '' : 's'}`}
                  />
                  <Tile tone="p" label="Open orders" value={open.length} detail={`${awaiting.length} awaiting SIL approval`} />
                </div>

                <div className="cards2">
                  <Card title="Recent orders" actions={<Link to="/orders">View all →</Link>}>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>SO / PO Ref</th>
                            <th>Items</th>
                            <th className="num">Value</th>
                            <th>Expected · Confirmed</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recent.map((o) => (
                            <tr key={o.key}>
                              <td>
                                <b>{o.so ?? '—'}</b>
                                <br />
                                <small>PO {o.po}</small>
                              </td>
                              <td>{o.item}</td>
                              <td className="num">{rupees(o.value)}</td>
                              <td>
                                <div className="date-pair">
                                  <DateChip kind="exp" value={o.expected} />
                                  <DateChip kind="conf" value={o.confirmed} />
                                </div>
                              </td>
                              <td>
                                <Tag tone={statusTone[o.status]}>{o.status}</Tag>
                              </td>
                            </tr>
                          ))}
                          {recent.length === 0 && (
                            <EmptyRow cols={5}>
                              No open orders. <Link to="/orders/new">Create a PO →</Link>
                            </EmptyRow>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  <Card title="What needs your attention">
                    <div className="bd">
                      <ul className="mini-list">
                        {alerts.length === 0 && (
                          <li>
                            <div>
                              <small>You're all caught up — nothing pending.</small>
                            </div>
                          </li>
                        )}
                        {alerts.map((a) => (
                          <li key={a.title}>
                            <span className="bdot" style={{ background: a.color }} />
                            <div>
                              <Link to={a.to}>
                                <b>{a.title}</b>
                              </Link>
                              {a.amount ? ` — ${rupees(a.amount)}` : ''}
                              <small>{a.note}</small>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </Card>
                </div>
              </>
            )
          }}
        </Async>
      </div>
    </>
  )
}
