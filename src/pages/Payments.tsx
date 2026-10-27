import { Topbar } from '../components/AppLayout'
import { Card, Tag } from '../components/ui'
import { paymentHistory, pendingPIs } from '../data/mock'
import { rupees } from '../utils/format'

export default function Payments() {
  return (
    <>
      <Topbar title="Proforma Invoices & Payments" crumb="Payments" />
      <div className="content">
        <Card title="Pending payment" className="mb" actions={<Tag tone="p">{pendingPIs.length} PIs</Tag>}>
          {pendingPIs.map((pi) => (
            <div className="pi-card" key={pi.pi}>
              <div className="pi-ic">🧾</div>
              <div className="info">
                <b>
                  {pi.pi} · against {pi.so}
                </b>
                <small>{pi.details}</small>
                {pi.cta && <small className="cta">{pi.cta}</small>}
              </div>
              <div className="pi-amt">{rupees(pi.amount)}</div>
              <div className="pi-actions">
                <button className="btn btn-ghost">View PI</button>
                <button className="btn btn-grad">Pay now →</button>
              </div>
            </div>
          ))}
        </Card>

        <Card title="Payment history" actions={<a href="#">Download all receipts</a>}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>PI / Ref</th>
                  <th>Mode</th>
                  <th>Gateway Txn ID</th>
                  <th className="num">Amount</th>
                  <th>SAP receipt</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.map((p) => (
                  <tr key={p.txn}>
                    <td>{p.date}</td>
                    <td>{p.ref}</td>
                    <td>{p.mode}</td>
                    <td>{p.txn}</td>
                    <td className="num">{rupees(p.amount)}</td>
                    <td>
                      {p.receipt ? (
                        <>
                          <b>{p.receipt}</b> <a href="#">⬇</a>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{p.ok ? <Tag tone="g">Success</Tag> : <Tag tone="r">Failed</Tag>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="footer-note">
          Successful payments post automatically into SAP B1 and restore your available credit for the same value. A
          payment receipt is emailed instantly.
        </p>
      </div>
    </>
  )
}
