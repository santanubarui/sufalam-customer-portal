import { useState } from 'react'
import { Topbar } from '../components/AppLayout'
import { Async, Card, EmptyRow, Tag, Tile } from '../components/ui'
import { DateInput } from '../components/DateInput'
import { useCustomer } from '../components/header'
import { useToast } from '../components/toast'
import { dmy, todayIso, type LedgerRow, type OpenInvoice, type TagTone } from '../api/portal'
import { getLedger, getOpenInvoices, getPayments } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { amount, rupees, fmtDate } from '../utils/format'

const drCr = (n: number) => `${amount(Math.abs(n))} ${n >= 0 ? 'Dr' : 'Cr'}`

/** 1 April of the current Indian financial year */
const fyStart = () => {
  const t = new Date()
  return `${t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1}-04-01`
}

const buckets = [
  { label: 'Not due', test: (d: number) => d <= 0, color: 'var(--green-600)' },
  { label: '1–30 d', test: (d: number) => d > 0 && d <= 30, color: 'var(--purple-600)' },
  { label: '31–60 d', test: (d: number) => d > 30 && d <= 60, color: '#D69E2E' },
  { label: '61–90 d', test: (d: number) => d > 60 && d <= 90, color: '#DD6B20' },
  { label: '90+ d', test: (d: number) => d > 90, color: 'var(--red)' },
]

const lakhs = (n: number) => `₹ ${(n / 100000).toFixed(2)} L`

const ageTag = (i: OpenInvoice): [TagTone, string] =>
  i.daysOverdue <= 0 ? ['g', 'Current'] : i.daysOverdue <= 30 ? ['a', `${i.daysOverdue} days`] : ['r', `${i.daysOverdue} days`]

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function Statements() {
  const customer = useCustomer()
  const toast = useToast()
  const [from, setFrom] = useState(fyStart())
  const [to, setTo] = useState(todayIso())
  const [range, setRange] = useState({ from, to })

  const receivables = useAsync(
    async (signal) => {
      const [invoices, payments] = await Promise.all([getOpenInvoices(signal), getPayments(signal)])
      return { invoices, advances: payments.filter((p) => p.onAccount && !p.cancelled) }
    },
    [customer.code],
  )
  const ledger = useAsync((signal) => getLedger(range.from, range.to, signal), [customer.code, customer.balance, range])

  const applyRange = () => {
    if (!from || !to) return toast.error('Choose both dates', 'Select a from and to date for the statement.')
    if (from > to) return toast.error('Invalid date range', '"From" date must be on or before the "to" date.')
    setRange({ from, to })
  }

  const exportCsv = () => {
    const l = ledger.data
    if (!l) return toast.error('Nothing to export', 'The ledger has not loaded yet.')
    const rows: (string | number)[][] = [
      ['Account statement', customer.name, customer.code],
      ['Period', dmy(range.from), dmy(range.to)],
      [],
      ['Date', 'Document', 'Particulars', 'Debit', 'Credit', 'Balance'],
      [dmy(range.from), '', 'Opening balance', '', '', drCr(l.opening)],
      ...l.rows.map((r: LedgerRow) => [dmy(r.date), r.doc, r.particulars, r.debit || '', r.credit || '', drCr(r.balance)]),
      [dmy(range.to), '', 'Closing balance', '', '', drCr(l.closing)],
    ]
    downloadCsv(`statement_${customer.code}_${range.from}_${range.to}.csv`, rows)
    toast.success('Statement exported', 'The CSV file opens in Excel.')
  }

  const utilised = customer.balance + customer.openOrdersBalance
  const utilisedPct = customer.creditLimit > 0 ? Math.min(100, Math.max(0, Math.round((utilised / customer.creditLimit) * 100))) : 0

  return (
    <>
      <Topbar title="Account Statement" crumb="Accounts / Statements">
        <button className="btn btn-ghost btn-sm" onClick={exportCsv}>
          Export Excel ⬇
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
          Export PDF ⬇
        </button>
      </Topbar>
      <div className="content">
        <Async state={receivables} label="Loading receivables from SAP…">
          {({ invoices, advances }) => {
            const overdue = invoices.filter((i) => i.daysOverdue > 0)
            const totalOpen = invoices.reduce((s, i) => s + i.balance, 0)
            const ageing = buckets.map((b) => {
              const sum = invoices.filter((i) => b.test(i.daysOverdue)).reduce((s, i) => s + i.balance, 0)
              return { ...b, sum, pct: totalOpen > 0 ? (sum / totalOpen) * 100 : 0 }
            })
            const advTotal = advances.reduce((s, p) => s + p.amount, 0)

            return (
              <>
                <div className="tiles">
                  <Tile label="Outstanding" value={rupees(customer.balance)} detail="live from SAP B1" />
                  <Tile
                    tone="r"
                    label="Overdue"
                    value={rupees(overdue.reduce((s, i) => s + i.balance, 0))}
                    detail={overdue.length ? `oldest ${Math.max(...overdue.map((i) => i.daysOverdue))} days` : 'nothing overdue'}
                    detailTone={overdue.length ? 'warn' : ''}
                  />
                  <Tile tone="p" label="Credit limit" value={rupees(customer.creditLimit)} detail={`available ${rupees(customer.available)}`} />
                  <Tile label="Advances" value={rupees(advTotal)} detail={`${advances.length} on account`} />
                </div>

                <div className="cards2 mb">
                  <Card title="Open & overdue invoices" actions={<Tag tone="n">{invoices.length} open</Tag>}>
                    <div className="bd" style={{ paddingBottom: '.4rem' }}>
                      <div className="agebar">
                        {ageing.map((a) => (
                          <span key={a.label} style={{ width: `${a.pct}%`, background: a.color }} title={`${a.label}: ${rupees(a.sum)}`} />
                        ))}
                      </div>
                      <div className="legend">
                        {ageing.map((a) => (
                          <span key={a.label}>
                            <i style={{ background: a.color }} />
                            {a.label} · {lakhs(a.sum)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Invoice</th>
                            <th>Date</th>
                            <th>Due date</th>
                            <th className="num">Original</th>
                            <th className="num">Balance</th>
                            <th>Ageing</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoices.map((i) => {
                            const [tone, label] = ageTag(i)
                            return (
                              <tr key={i.docEntry}>
                                <td>
                                  <b>{i.invoice}</b>
                                </td>
                                <td>{fmtDate(i.date)}</td>
                                <td>{fmtDate(i.due)}</td>
                                <td className="num">{amount(i.original)}</td>
                                <td className="num">{amount(i.balance)}</td>
                                <td>
                                  <Tag tone={tone}>{label}</Tag>
                                </td>
                              </tr>
                            )
                          })}
                          {invoices.length === 0 && <EmptyRow cols={6}>No open invoices.</EmptyRow>}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  <Card title="Advance list">
                    <table>
                      <thead>
                        <tr>
                          <th>Ref</th>
                          <th>Date</th>
                          <th className="num">Amount</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {advances.slice(0, 8).map((a) => (
                          <tr key={a.docEntry}>
                            <td>
                              <b>{a.receipt}</b>
                              <br />
                              <small>On account · {a.mode}</small>
                            </td>
                            <td>{fmtDate(a.date)}</td>
                            <td className="num">{amount(a.amount)}</td>
                            <td>
                              <Tag tone="p">On account</Tag>
                            </td>
                          </tr>
                        ))}
                        {advances.length === 0 && <EmptyRow cols={4}>No advances on account.</EmptyRow>}
                      </tbody>
                    </table>
                    <div className="hd top-line">
                      <h3>Credit position</h3>
                    </div>
                    <div className="bd">
                      <div style={{ fontSize: '.8rem', display: 'flex', justifyContent: 'space-between', marginBottom: '.4rem' }}>
                        <span className="muted">Utilised {rupees(utilised)} (incl. open orders)</span>
                        <b>{customer.creditLimit > 0 ? `${utilisedPct}%` : 'no limit set'}</b>
                      </div>
                      <div className="agebar" style={{ margin: '.2rem 0 .8rem' }}>
                        <span style={{ width: `${utilisedPct}%`, background: 'var(--grad)' }} />
                        <span style={{ width: `${100 - utilisedPct}%`, background: 'var(--line)' }} />
                      </div>
                      <p className="auth-note" style={{ fontSize: '.76rem' }}>
                        Available credit is restored as soon as your payment is posted in SAP B1.
                      </p>
                    </div>
                  </Card>
                </div>
              </>
            )
          }}
        </Async>

        <Card
          title="Ledger statement"
          actions={
            <>
              <DateInput className="input-sm" aria-label="From date" value={from} max={to} onChange={setFrom} />
              <span className="muted" style={{ fontSize: '.8rem', padding: '0 .4rem' }}>
                to
              </span>
              <DateInput className="input-sm" aria-label="To date" value={to} max={todayIso()} onChange={setTo} />
              <button className="btn btn-primary btn-sm" style={{ marginLeft: '.6rem' }} onClick={applyRange} disabled={ledger.loading}>
                {ledger.loading ? 'Loading…' : 'Apply'}
              </button>
            </>
          }
        >
          <Async state={ledger} label="Building your statement from SAP…">
            {(l) => (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Document</th>
                      <th>Particulars</th>
                      <th className="num">Debit</th>
                      <th className="num">Credit</th>
                      <th className="num">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{fmtDate(range.from)}</td>
                      <td>—</td>
                      <td>
                        <b>Opening balance</b>
                      </td>
                      <td className="num" />
                      <td className="num" />
                      <td className="num">
                        <b>{drCr(l.opening)}</b>
                      </td>
                    </tr>
                    {l.rows.map((r) => (
                      <tr key={r.doc}>
                        <td>{fmtDate(r.date)}</td>
                        <td>{r.doc}</td>
                        <td>{r.particulars}</td>
                        <td className="num">{r.debit ? amount(r.debit) : ''}</td>
                        <td className="num">{r.credit ? amount(r.credit) : ''}</td>
                        <td className="num">{drCr(r.balance)}</td>
                      </tr>
                    ))}
                    {l.rows.length === 0 && <EmptyRow cols={6}>No transactions in this period.</EmptyRow>}
                    <tr>
                      <td>{fmtDate(range.to)}</td>
                      <td>—</td>
                      <td>
                        <b>Closing balance</b>
                      </td>
                      <td className="num" />
                      <td className="num" />
                      <td className="num">
                        <b>{drCr(l.closing)}</b>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Async>
        </Card>
        <p className="footer-note">
          Statement compiled from A/R invoices, down payment invoices, credit memos and incoming payments in SAP B1.
        </p>
      </div>
    </>
  )
}
