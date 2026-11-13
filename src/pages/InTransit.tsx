import { Fragment, useEffect, useState, type FormEvent } from 'react'
import { Topbar } from '../components/AppLayout'
import { Async, Card, EmptyRow, Tag } from '../components/ui'
import { useCustomer, usePortal } from '../components/header'
import { useToast } from '../components/toast'
import { todayIso, type Delivery } from '../api/portal'
import { acknowledgeDelivery, errorMessage, getDeliveries } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { longDate, rupees } from '../utils/format'

const stages = ['Order confirmed', 'Dispatched', 'In transit', 'Acknowledged']
const IN_TRANSIT_STAGE = 2

export default function InTransit() {
  const customer = useCustomer()
  const state = useAsync((signal) => getDeliveries(signal), [customer.code])

  return (
    <>
      <Topbar title="In-Transit Deliveries" crumb="Deliveries / In-Transit" />
      <div className="content">
        <Async state={state} label="Loading deliveries from SAP…">
          {({ inTransit, acknowledged }) => (
            <>
              {inTransit.length === 0 ? (
                <Card className="mb">
                  <div className="bd muted">No deliveries are in transit to you right now.</div>
                </Card>
              ) : (
                <InTransitList list={inTransit} onDone={state.reload} />
              )}

              <Card title="Recently acknowledged" className="mt">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Delivery</th>
                        <th>Reference</th>
                        <th>Items</th>
                        <th className="num">Value</th>
                        <th>Received on</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acknowledged.map((a) => {
                        const ok = /full/i.test(a.ack?.note ?? '')
                        return (
                          <tr key={a.docEntry}>
                            <td>
                              <b>{a.dn}</b>
                            </td>
                            <td>{a.ref || '—'}</td>
                            <td>
                              {a.item} · {a.qty}
                            </td>
                            <td className="num">{rupees(a.value)}</td>
                            <td>{longDate(a.ack?.date)}</td>
                            <td>
                              <Tag tone={ok ? 'g' : 'a'}>{ok ? 'Acknowledged' : 'Ack. with remarks'}</Tag>
                            </td>
                          </tr>
                        )
                      })}
                      {acknowledged.length === 0 && <EmptyRow cols={6}>No acknowledged deliveries yet.</EmptyRow>}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </Async>
      </div>
    </>
  )
}

function InTransitList({ list, onDone }: { list: Delivery[]; onDone: () => void }) {
  const [selected, setSelected] = useState(list[0].docEntry)
  useEffect(() => {
    if (!list.some((d) => d.docEntry === selected)) setSelected(list[0].docEntry)
  }, [list, selected])
  const d = list.find((x) => x.docEntry === selected) ?? list[0]

  return (
    <>
      {list.length > 1 && (
        <div className="btn-row mb" style={{ marginTop: 0, flexWrap: 'wrap', gap: '.5rem' }}>
          {list.map((x) => (
            <button
              key={x.docEntry}
              className={`btn btn-sm ${x.docEntry === d.docEntry ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSelected(x.docEntry)}
            >
              {x.dn}
            </button>
          ))}
        </div>
      )}

      <Card className="mb">
        <div className="bd">
          <div className="btn-row" style={{ marginTop: 0, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <b style={{ fontSize: '1rem' }}>Delivery {d.dn}</b>
              {d.ref ? ` · ${d.ref}` : ''} · <Tag tone="p">In-Transit</Tag>
              <div className="muted" style={{ fontSize: '.78rem', marginTop: '.3rem' }}>
                {d.item} · {d.qty} · {rupees(d.value)} · Dispatched {longDate(d.date)}
              </div>
            </div>
            <div className="pi-actions">
              <a className="btn btn-purple" href="#ack">
                Acknowledge receipt ✓
              </a>
            </div>
          </div>
          <div className="track">
            {stages.map((s, i) => (
              <Fragment key={s}>
                {i > 0 && <div className={`tline ${i <= IN_TRANSIT_STAGE ? 'done' : ''}`} />}
                <div className={`tnode ${i < IN_TRANSIT_STAGE ? 'done' : i === IN_TRANSIT_STAGE ? 'now' : ''}`}>
                  {i < IN_TRANSIT_STAGE ? '✓' : i === IN_TRANSIT_STAGE ? '🚚' : '●'}
                </div>
              </Fragment>
            ))}
          </div>
          <div className="tlabels">
            {stages.map((s, i) => (
              <span key={s} className={i === IN_TRANSIT_STAGE ? 'now' : ''}>
                {s}
              </span>
            ))}
          </div>
        </div>
      </Card>

      <AckForm key={d.docEntry} delivery={d} onDone={onDone} />
    </>
  )
}

function AckForm({ delivery, onDone }: { delivery: Delivery; onDone: () => void }) {
  const toast = useToast()
  const { refreshAlerts } = usePortal()
  const [receivedOn, setReceivedOn] = useState(todayIso())
  const [condition, setCondition] = useState('Received in full — OK')
  const [remarks, setRemarks] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const issue = !condition.includes('full')
    const problem = !receivedOn
      ? 'Enter the received date.'
      : receivedOn < delivery.date
        ? "Received date can't be before the dispatch date."
        : receivedOn > todayIso()
          ? "Received date can't be in the future."
          : issue && !remarks.trim()
            ? 'Please describe the shortage or damage in remarks.'
            : ''
    setError(problem)
    if (problem) return toast.error('Please check the form', problem)

    setBusy(true)
    try {
      const { attachWarning: warn } = await acknowledgeDelivery(delivery.docEntry, { receivedOn, condition, remarks }, photo)
      toast.success('Receipt acknowledged', `${delivery.dn} has been marked as received in SAP.`)
      if (warn) toast.error('Photo was not attached', warn)
      refreshAlerts()
      onDone()
    } catch (err) {
      const msg = errorMessage(err)
      setError(msg)
      toast.error('Acknowledgement failed', msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={`Acknowledgement form — ${delivery.dn}`}>
      <form className="bd" id="ack" onSubmit={onSubmit} noValidate>
        <div className="grid3">
          <div className="field">
            <label>Received date *</label>
            <input type="date" max={todayIso()} value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
          </div>
          <div className="field">
            <label>Condition</label>
            <select value={condition} onChange={(e) => setCondition(e.target.value)}>
              <option>Received in full — OK</option>
              <option>Received with shortage</option>
              <option>Received with damage</option>
            </select>
          </div>
          <div className="field">
            <label>Photo (if shortage/damage)</label>
            <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <div className="field">
          <label>Remarks</label>
          <textarea rows={2} placeholder="Optional remarks" maxLength={150} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="btn-row" style={{ marginTop: 0 }}>
          <span className="spacer" />
          <button type="submit" className="btn btn-grad" disabled={busy}>
            {busy ? 'Saving to SAP…' : 'Confirm acknowledgement ✓'}
          </button>
        </div>
        <p className="form-note">Your confirmation is recorded on the delivery document in Sufalam's SAP B1 instantly.</p>
      </form>
    </Card>
  )
}
