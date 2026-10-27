import { Link } from 'react-router-dom'
import { Topbar } from '../components/AppLayout'
import { Card, DateChip, Tag, Tile } from '../components/ui'
import { attention, orders, statusTone, summary } from '../data/mock'
import { rupees } from '../utils/format'

const shortDay = (d: string | null) => (d ? d.replace(/ \d{4}$/, '') : null)

export default function Dashboard() {
  const recent = orders.filter((o) => o.status !== 'Delivered').slice(0, 3)

  return (
    <>
      <Topbar title="Dashboard" crumb="Home / Overview" search="Search order, invoice, PI…" />
      <div className="content">
        <div className="tiles">
          <Tile label="Total outstanding" value={rupees(summary.outstanding)} detail={`as on ${summary.asOn}`} />
          <Tile tone="r" label="Overdue" value={rupees(summary.overdue)} detail={`${summary.overdueCount} invoices past due`} detailTone="warn" />
          <Tile tone="p" label="Available credit" value={rupees(summary.available)} detail={`limit ${rupees(summary.creditLimit)}`} detailTone="up" />
          <Tile label="Advances" value={rupees(summary.advances)} detail={`${summary.advanceCount} unadjusted advance`} />
          <Tile tone="p" label="Open orders" value={summary.openOrders} detail={`${summary.awaitingApproval} awaiting SIL approval`} />
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
                    <tr key={o.po}>
                      <td>
                        <b>{o.so ?? '—'}</b>
                        <br />
                        <small>PO {o.po}</small>
                      </td>
                      <td>{o.item}</td>
                      <td className="num">{rupees(o.value)}</td>
                      <td>
                        <div className="date-pair">
                          <DateChip kind="exp" value={shortDay(o.expected)} />
                          <DateChip kind="conf" value={shortDay(o.confirmed)} />
                        </div>
                      </td>
                      <td>
                        <Tag tone={statusTone[o.status]}>{o.status}</Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="What needs your attention">
            <div className="bd">
              <ul className="mini-list">
                {attention.map((a) => (
                  <li key={a.title}>
                    <span className="bdot" style={{ background: a.color }} />
                    <div>
                      <b>{a.title}</b>
                      {a.amount ? ` — ${rupees(a.amount)}` : ''}
                      <small>{a.note}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
