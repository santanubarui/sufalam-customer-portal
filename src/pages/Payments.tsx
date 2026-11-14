import { useState } from 'react'
import { Topbar } from '../components/AppLayout'
import { Async, Card, EmptyRow, Tag } from '../components/ui'
import { useCustomer } from '../components/header'
import { useToast } from '../components/toast'
import { getPayments, getPendingProformas } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { amount, fmtDate, rupees } from '../utils/format'

export default function Payments() {
  const customer = useCustomer()
  const toast = useToast()
  const [openPi, setOpenPi] = useState<number | null>(null)

  const pis = useAsync((signal) => getPendingProformas(signal), [customer.code])
  const payments = useAsync((signal) => getPayments(signal), [customer.code])

  const payNow = (pi: string, amt: number) =>
    toast.info(
      'Online payment not enabled yet',
      `Please pay ${rupees(amt)} against ${pi} by bank transfer quoting ${pi}. It will appear here once posted in SAP.`,
    )

  return (
    <>
      <Topbar title="Proforma Invoices & Payments" crumb="Payments" />
      <div className="content">
        <Card title="Pending payment" className="mb" actions={pis.data && <Tag tone="p">{pis.data.length} PIs</Tag>}>
          <Async state={pis} label="Loading proforma invoices from SAP…">
            {(list) =>
              list.length === 0 ? (
                <div className="bd muted">No proforma invoices are awaiting payment.</div>
              ) : (
                <>
                  {list.map((pi) => (
                    <div key={pi.docEntry}>
                      <div className="pi-card">
                        <div className="pi-ic">🧾</div>
                        <div className="info">
                          <b>
                            {pi.pi} · against {pi.ref}
                          </b>
                          <small>{pi.details}</small>
                          <small className="cta">Pay to release dispatch — delivery is posted once payment is received</small>
                        </div>
                        <div className="pi-amt">{rupees(pi.amount)}</div>
                        <div className="pi-actions">
                          <button className="btn btn-ghost" onClick={() => setOpenPi(openPi === pi.docEntry ? null : pi.docEntry)}>
                            {openPi === pi.docEntry ? 'Hide PI' : 'View PI'}
                          </button>
                          <button className="btn btn-grad" onClick={() => payNow(pi.pi, pi.amount)}>
                            Pay now →
                          </button>
                        </div>
                      </div>
                      {openPi === pi.docEntry && (
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>Item</th>
                                <th className="num">Qty</th>
                                <th className="num">Line total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pi.lines.map((l, i) => (
                                <tr key={i}>
                                  <td>{l.item}</td>
                                  <td className="num">{l.qty}</td>
                                  <td className="num">{amount(l.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )
            }
          </Async>
        </Card>

        <Card title="Payment history" actions={<button className="linkbtn" onClick={payments.reload}>↻ Refresh</button>}>
          <Async state={payments} label="Loading payments from SAP…">
            {(list) => (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Reference</th>
                      <th>Mode</th>
                      <th>Transfer ref</th>
                      <th className="num">Amount</th>
                      <th>SAP receipt</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.slice(0, 25).map((p) => (
                      <tr key={p.docEntry}>
                        <td>{fmtDate(p.date)}</td>
                        <td>{p.ref}</td>
                        <td>{p.mode}</td>
                        <td>{p.txnRef}</td>
                        <td className="num">{rupees(p.amount)}</td>
                        <td>
                          <b>{p.receipt}</b>
                        </td>
                        <td>{p.cancelled ? <Tag tone="r">Cancelled</Tag> : <Tag tone="g">Posted</Tag>}</td>
                      </tr>
                    ))}
                    {list.length === 0 && <EmptyRow cols={7}>No payments recorded in SAP yet.</EmptyRow>}
                  </tbody>
                </table>
              </div>
            )}
          </Async>
        </Card>
        <p className="footer-note">
          Payments posted in SAP B1 reduce your outstanding and restore your available credit for the same value.
        </p>
      </div>
    </>
  )
}
