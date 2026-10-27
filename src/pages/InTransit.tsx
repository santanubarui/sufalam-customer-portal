import { Fragment, useState, type FormEvent } from 'react'
import { Topbar } from '../components/AppLayout'
import { Card, Tag } from '../components/ui'
import { acknowledged, inTransit } from '../data/mock'
import { rupees } from '../utils/format'

export default function InTransit() {
  const [acked, setAcked] = useState(false)
  const current = acked ? inTransit.stages.length : inTransit.current

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setAcked(true)
  }

  return (
    <>
      <Topbar title="In-Transit Deliveries" crumb="Deliveries / In-Transit" />
      <div className="content">
        <Card className="mb">
          <div className="bd">
            <div className="btn-row" style={{ marginTop: 0, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <b style={{ fontSize: '1rem' }}>Invoice {inTransit.invoice}</b> · {inTransit.so} ·{' '}
                {acked ? <Tag tone="g">Acknowledged</Tag> : <Tag tone="p">In-Transit</Tag>}
                <div className="muted" style={{ fontSize: '.78rem', marginTop: '.3rem' }}>
                  {inTransit.summary}
                </div>
              </div>
              <div className="pi-actions">
                <button className="btn btn-ghost">Invoice PDF ⬇</button>
                {!acked && (
                  <a className="btn btn-purple" href="#ack">
                    Acknowledge receipt ✓
                  </a>
                )}
              </div>
            </div>
            <div className="track">
              {inTransit.stages.map((s, i) => (
                <Fragment key={s}>
                  {i > 0 && <div className={`tline ${i <= current ? 'done' : ''}`} />}
                  <div className={`tnode ${i < current ? 'done' : i === current ? 'now' : ''}`}>
                    {i < current ? '✓' : i === current ? '🚚' : '●'}
                  </div>
                </Fragment>
              ))}
            </div>
            <div className="tlabels">
              {inTransit.stages.map((s, i) => (
                <span key={s} className={i === current ? 'now' : ''}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        </Card>

        {!acked && (
          <Card title={`Acknowledgement form — ${inTransit.invoice}`}>
            <form className="bd" id="ack" onSubmit={onSubmit}>
              <div className="grid3">
                <div className="field"><label>Received date *</label><input type="date" required /></div>
                <div className="field">
                  <label>Condition</label>
                  <select>
                    <option>Received in full — OK</option>
                    <option>Received with shortage</option>
                    <option>Received with damage</option>
                  </select>
                </div>
                <div className="field"><label>Photo (if shortage/damage)</label><input type="file" accept="image/*" /></div>
              </div>
              <div className="field">
                <label>Remarks</label>
                <textarea rows={2} placeholder="Optional remarks" />
              </div>
              <div className="btn-row" style={{ marginTop: 0 }}>
                <span className="spacer" />
                <button type="submit" className="btn btn-grad">
                  Confirm acknowledgement ✓
                </button>
              </div>
              <p className="form-note">Your confirmation updates the invoice status in Sufalam's SAP B1 instantly.</p>
            </form>
          </Card>
        )}

        <Card title="Recently acknowledged" className="mt">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>SO</th>
                  <th className="num">Qty (MT)</th>
                  <th className="num">Value</th>
                  <th>Acknowledged on</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {acknowledged.map((a) => (
                  <tr key={a.invoice}>
                    <td><b>{a.invoice}</b></td>
                    <td>{a.so}</td>
                    <td className="num">{a.qty}</td>
                    <td className="num">{rupees(a.value)}</td>
                    <td>{a.on}</td>
                    <td><Tag tone={a.tone}>{a.status}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  )
}
