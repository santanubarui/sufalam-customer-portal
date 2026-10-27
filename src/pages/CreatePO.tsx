import { useState } from 'react'
import { Topbar } from '../components/AppLayout'
import { Card } from '../components/ui'
import { GST_RATE, priceList, shipTo } from '../data/mock'
import { amount, rupees } from '../utils/format'

interface Line {
  id: number
  code: string
  qty: number
  date: string
}

let nextId = 1

export default function CreatePO() {
  const [lines, setLines] = useState<Line[]>([
    { id: nextId++, code: 'ITM-00214', qty: 4, date: '' },
  ])

  const item = (code: string) => priceList.find((p) => p.code === code)!
  const update = (id: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  const subTotal = lines.reduce((s, l) => s + l.qty * item(l.code).rate, 0)
  const gst = Math.round(subTotal * GST_RATE)

  return (
    <>
      <Topbar title="Create Purchase Order" crumb="Orders / New PO" />
      <div className="content">
        <Card title="PO header" className="mb">
          <div className="bd">
            <div className="grid3">
              <div className="field"><label>Your PO number *</label><input placeholder="EV/2026/095" /></div>
              <div className="field"><label>PO date *</label><input type="date" /></div>
              <div className="field"><label>PO copy (PDF) *</label><input type="file" accept=".pdf" /></div>
              <div className="field">
                <label>Delivery terms *</label>
                <select>
                  <option>FOR Destination</option>
                  <option>Ex-Works</option>
                </select>
              </div>
              <div className="field">
                <label>Freight</label>
                <select>
                  <option>To Sufalam's account</option>
                  <option>To buyer's account</option>
                </select>
              </div>
              <div className="field">
                <label>Ship-to address *</label>
                <select>
                  {shipTo.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Remarks</label>
              <textarea rows={2} placeholder="Any special instructions" />
            </div>
          </div>
        </Card>

        <Card title="PO lines" actions={<span className="hint">rates auto-fetched from your price list</span>}>
          <div className="table-wrap">
            <table className="po-lines">
              <thead>
                <tr>
                  <th style={{ width: '34%' }}>Item</th>
                  <th className="num">Qty (MT)</th>
                  <th className="num">Rate / MT</th>
                  <th className="num">Amount</th>
                  <th>Expected delivery *</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const it = item(l.code)
                  return (
                    <tr key={l.id}>
                      <td>
                        <select className="input-sm" value={l.code} onChange={(e) => update(l.id, { code: e.target.value })}>
                          {priceList.map((p) => (
                            <option key={p.code} value={p.code}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <br />
                        <small>{it.code}</small>
                      </td>
                      <td className="num">
                        <input
                          className="input-sm qty-input"
                          type="number"
                          min={0}
                          step={0.001}
                          value={l.qty}
                          onChange={(e) => update(l.id, { qty: Number(e.target.value) })}
                        />
                      </td>
                      <td className="num">{amount(it.rate)}</td>
                      <td className="num">
                        <b>{amount(l.qty * it.rate)}</b>
                      </td>
                      <td>
                        <input className="input-sm" type="date" value={l.date} onChange={(e) => update(l.id, { date: e.target.value })} />
                      </td>
                      <td>
                        <button
                          className="rm"
                          title="Remove line"
                          disabled={lines.length === 1}
                          onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="bd">
            <button
              className="btn btn-ghost addline"
              onClick={() => setLines((ls) => [...ls, { id: nextId++, code: priceList[0].code, qty: 1, date: '' }])}
            >
              ＋ Add line
            </button>
            <div className="totals">
              <div><span>Sub-total</span><b>{rupees(subTotal)}</b></div>
              <div><span>GST @ {GST_RATE * 100}%</span><b>{rupees(gst)}</b></div>
              <div className="grand"><span>PO value</span><span>{rupees(subTotal + gst)}</span></div>
            </div>
            <div className="btn-row">
              <span className="spacer" />
              <button className="btn btn-ghost">Save draft</button>
              <button className="btn btn-grad">Submit to Sufalam →</button>
            </div>
            <p className="form-note">
              On approval by Sufalam, a Sales Order is created automatically and you'll be notified with confirmed
              delivery dates.
            </p>
          </div>
        </Card>
      </div>
    </>
  )
}
