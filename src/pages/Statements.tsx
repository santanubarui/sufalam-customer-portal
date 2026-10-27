import { useMemo, useState } from 'react'
import { Topbar } from '../components/AppLayout'
import { Card, Tag, Tile } from '../components/ui'
import { advanceList, ageing, ledger, openInvoices, openingBalance, summary } from '../data/mock'
import { amount, rupees, shortDate } from '../utils/format'

const drCr = (n: number) => `${amount(Math.abs(n))} ${n >= 0 ? 'Dr' : 'Cr'}`

export default function Statements() {
  const [from, setFrom] = useState(openingBalance.date)
  const [to, setTo] = useState('2026-07-13')
  const [range, setRange] = useState({ from, to })

  const utilised = summary.outstanding
  const utilisedPct = Math.round((utilised / summary.creditLimit) * 100)

  // Opening balance for the chosen range = base opening + all movements before `from`.
  const { opening, rows } = useMemo(() => {
    let bal = openingBalance.amount
    const rows: ((typeof ledger)[number] & { balance: number })[] = []
    for (const e of ledger) {
      if (e.date > range.to) break
      bal += (e.debit ?? 0) - (e.credit ?? 0)
      if (e.date >= range.from) rows.push({ ...e, balance: bal })
    }
    const first = rows[0]
    const opening = first ? first.balance - (first.debit ?? 0) + (first.credit ?? 0) : bal
    return { opening, rows }
  }, [range])

  return (
    <>
      <Topbar title="Account Statement" crumb="Accounts / Statements">
        <button className="btn btn-ghost btn-sm">Export Excel ⬇</button>
        <button className="btn btn-primary btn-sm">Export PDF ⬇</button>
      </Topbar>
      <div className="content">
        <div className="tiles">
          <Tile label="Outstanding" value={rupees(summary.outstanding)} detail="live from SAP B1" />
          <Tile tone="r" label="Overdue" value={rupees(summary.overdue)} detail={`oldest ${summary.oldestOverdueDays} days`} detailTone="warn" />
          <Tile tone="p" label="Credit limit" value={rupees(summary.creditLimit)} detail={`available ${rupees(summary.available)}`} />
          <Tile label="Advances" value={rupees(summary.advances)} detail={`${summary.advanceCount} on account`} />
        </div>

        <div className="cards2 mb">
          <Card title="Open & overdue invoices" actions={<a href="#">Ageing report →</a>}>
            <div className="bd" style={{ paddingBottom: '.4rem' }}>
              <div className="agebar">
                {ageing.map((a) => (
                  <span key={a.label} style={{ width: `${a.pct}%`, background: a.color }} title={a.label} />
                ))}
              </div>
              <div className="legend">
                {ageing.map((a) => (
                  <span key={a.label}>
                    <i style={{ background: a.color }} />
                    {a.label} · {a.amount}
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
                  {openInvoices.map((i) => (
                    <tr key={i.invoice}>
                      <td><b>{i.invoice}</b></td>
                      <td>{i.date}</td>
                      <td>{i.due}</td>
                      <td className="num">{amount(i.original)}</td>
                      <td className="num">{amount(i.balance)}</td>
                      <td><Tag tone={i.tone}>{i.ageing}</Tag></td>
                    </tr>
                  ))}
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
                {advanceList.map((a) => (
                  <tr key={a.ref}>
                    <td>
                      <b>{a.ref}</b>
                      <br />
                      <small>{a.note}</small>
                    </td>
                    <td>{a.date}</td>
                    <td className="num">{amount(a.amount)}</td>
                    <td><Tag tone="p">{a.status}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="hd top-line">
              <h3>Credit position</h3>
            </div>
            <div className="bd">
              <div style={{ fontSize: '.8rem', display: 'flex', justifyContent: 'space-between', marginBottom: '.4rem' }}>
                <span className="muted">Utilised {rupees(utilised)}</span>
                <b>{utilisedPct}%</b>
              </div>
              <div className="agebar" style={{ margin: '.2rem 0 .8rem' }}>
                <span style={{ width: `${utilisedPct}%`, background: 'var(--grad)' }} />
                <span style={{ width: `${100 - utilisedPct}%`, background: 'var(--line)' }} />
              </div>
              <p className="auth-note" style={{ fontSize: '.76rem' }}>
                Available credit is restored automatically the moment your online payment posts into SAP B1.
              </p>
            </div>
          </Card>
        </div>

        <Card
          title="Ledger statement"
          actions={
            <>
              <input className="input-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="muted" style={{ fontSize: '.8rem', padding: '0 .4rem' }}>to</span>
              <input className="input-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              <button className="btn btn-primary btn-sm" style={{ marginLeft: '.6rem' }} onClick={() => setRange({ from, to })}>
                Apply
              </button>
            </>
          }
        >
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
                  <td>{shortDate(range.from)}</td>
                  <td>—</td>
                  <td><b>Opening balance</b></td>
                  <td className="num" />
                  <td className="num" />
                  <td className="num"><b>{drCr(opening)}</b></td>
                </tr>
                {rows.map((r) => (
                  <tr key={r.doc}>
                    <td>{shortDate(r.date)}</td>
                    <td>{r.doc}</td>
                    <td>{r.particulars}</td>
                    <td className="num">{r.debit ? amount(r.debit) : ''}</td>
                    <td className="num">{r.credit ? amount(r.credit) : ''}</td>
                    <td className="num">{drCr(r.balance)}</td>
                  </tr>
                ))}
                <tr>
                  <td>{shortDate(range.to)}</td>
                  <td>—</td>
                  <td><b>Closing balance</b></td>
                  <td className="num" />
                  <td className="num" />
                  <td className="num"><b>{drCr(rows.length ? rows[rows.length - 1].balance : opening)}</b></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  )
}
