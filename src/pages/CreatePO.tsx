import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Topbar } from '../components/AppLayout'
import { Async, Card } from '../components/ui'
import { useCustomer } from '../components/header'
import { useToast } from '../components/toast'
import { todayIso, type SalesItem } from '../api/portal'
import { errorMessage, getSalesItems, submitPurchaseOrder } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { amount, rupees } from '../utils/format'

/** Indicative only — SAP applies the actual tax codes when Sufalam approves the order. */
const GST_RATE = 0.18
const DRAFT_KEY = 'sufalam.poDraft'
const MAX_PDF_MB = 5

interface Line {
  id: number
  code: string
  qty: number
  date: string
}

interface Header {
  poNumber: string
  poDate: string
  deliveryTerms: string
  freight: string
  shipTo: string
  remarks: string
}

let nextId = 1

const loadDraft = (cardCode: string): { header: Header; lines: Line[] } | null => {
  try {
    const raw = localStorage.getItem(`${DRAFT_KEY}.${cardCode}`)
    if (!raw) return null
    const d = JSON.parse(raw) as { header: Header; lines: Omit<Line, 'id'>[] }
    return { header: d.header, lines: d.lines.map((l) => ({ ...l, id: nextId++ })) }
  } catch {
    return null
  }
}

export default function CreatePO() {
  const customer = useCustomer()
  const items = useAsync((signal) => getSalesItems(signal), [customer.priceList])

  return (
    <>
      <Topbar title="Create Purchase Order" crumb="Orders / New PO" />
      <div className="content">
        <Async state={items} label="Loading your price list from SAP…">
          {(list) =>
            list.length ? (
              <POForm items={list} />
            ) : (
              <Card>
                <div className="bd muted">No sellable items were found in SAP for your account.</div>
              </Card>
            )
          }
        </Async>
      </div>
    </>
  )
}

function POForm({ items }: { items: SalesItem[] }) {
  const customer = useCustomer()
  const toast = useToast()
  const navigate = useNavigate()

  const saved = useMemo(() => loadDraft(customer.code), [customer.code])
  const blankHeader: Header = {
    poNumber: '',
    poDate: todayIso(),
    deliveryTerms: 'FOR Destination',
    freight: "To Sufalam's account",
    shipTo: customer.shipTo[0]?.code ?? '',
    remarks: '',
  }
  const [header, setHeader] = useState<Header>(saved?.header ?? blankHeader)
  const [lines, setLines] = useState<Line[]>(saved?.lines ?? [{ id: nextId++, code: items[0].code, qty: 1, date: '' }])
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const byCode = useMemo(() => new Map(items.map((i) => [i.code, i])), [items])
  const item = (code: string) => byCode.get(code) ?? items[0]
  const update = (id: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const setH = (patch: Partial<Header>) => setHeader((h) => ({ ...h, ...patch }))

  const subTotal = lines.reduce((s, l) => s + l.qty * item(l.code).rate, 0)
  const gst = Math.round(subTotal * GST_RATE)

  const validate = () => {
    if (!header.poNumber.trim()) return 'Enter your PO number.'
    if (!header.poDate) return 'Enter the PO date.'
    if (!file) return 'Attach a PDF copy of your PO.'
    if (file.size > MAX_PDF_MB * 1048576) return `PO copy must be ${MAX_PDF_MB} MB or smaller.`
    if (customer.shipTo.length && !header.shipTo) return 'Choose a ship-to address.'
    for (const [i, l] of lines.entries()) {
      if (!(l.qty > 0)) return `Line ${i + 1}: quantity must be greater than zero.`
      if (!l.date) return `Line ${i + 1}: choose an expected delivery date.`
      if (l.date < header.poDate) return `Line ${i + 1}: expected delivery can't be before the PO date.`
    }
    return ''
  }

  const saveDraft = () => {
    try {
      localStorage.setItem(
        `${DRAFT_KEY}.${customer.code}`,
        JSON.stringify({ header, lines: lines.map(({ code, qty, date }) => ({ code, qty, date })) }),
      )
      toast.success('Draft saved', 'Your PO is saved on this device. Attach the PDF again before submitting.')
    } catch {
      toast.error('Could not save draft', 'Browser storage is unavailable.')
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const problem = validate()
    setError(problem)
    if (problem) return toast.error('Please check the form', problem)

    setBusy(true)
    try {
      const { docNum, attachWarning } = await submitPurchaseOrder(
        {
          poNumber: header.poNumber.trim(),
          poDate: header.poDate,
          deliveryTerms: header.deliveryTerms,
          freight: header.freight,
          shipTo: header.shipTo,
          remarks: header.remarks,
          lines: lines.map((l) => ({ itemCode: l.code, quantity: l.qty, expectedDate: l.date })),
        },
        file,
      )

      try {
        localStorage.removeItem(`${DRAFT_KEY}.${customer.code}`)
      } catch {
        /* ignore */
      }
      toast.success('PO submitted to Sufalam', `PO ${header.poNumber.trim()} saved in SAP as draft #${docNum} — awaiting approval.`)
      if (attachWarning) toast.error('PO copy was not attached', `The order was created, but the PDF upload failed: ${attachWarning}`)
      navigate('/orders')
    } catch (err) {
      const msg = errorMessage(err)
      setError(msg)
      toast.error('Could not submit PO', msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card title="PO header" className="mb">
        <div className="bd">
          <div className="grid3">
            <div className="field">
              <label>Your PO number *</label>
              <input placeholder="EV/2026/095" maxLength={100} value={header.poNumber} onChange={(e) => setH({ poNumber: e.target.value })} />
            </div>
            <div className="field">
              <label>PO date *</label>
              <input type="date" value={header.poDate} onChange={(e) => setH({ poDate: e.target.value })} />
            </div>
            <div className="field">
              <label>PO copy (PDF) *</label>
              <input type="file" accept=".pdf,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="field">
              <label>Delivery terms *</label>
              <select value={header.deliveryTerms} onChange={(e) => setH({ deliveryTerms: e.target.value })}>
                <option>FOR Destination</option>
                <option>Ex-Works</option>
              </select>
            </div>
            <div className="field">
              <label>Freight</label>
              <select value={header.freight} onChange={(e) => setH({ freight: e.target.value })}>
                <option>To Sufalam's account</option>
                <option>To buyer's account</option>
              </select>
            </div>
            <div className="field">
              <label>Ship-to address *</label>
              <select value={header.shipTo} onChange={(e) => setH({ shipTo: e.target.value })}>
                {customer.shipTo.length === 0 && <option value="">Default address on file</option>}
                {customer.shipTo.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Remarks</label>
            <textarea rows={2} placeholder="Any special instructions" value={header.remarks} onChange={(e) => setH({ remarks: e.target.value })} />
          </div>
        </div>
      </Card>

      <Card title="PO lines" actions={<span className="hint">rates from your SAP price list #{customer.priceList}</span>}>
        <div className="table-wrap">
          <table className="po-lines">
            <thead>
              <tr>
                <th style={{ width: '34%' }}>Item</th>
                <th className="num">Qty</th>
                <th className="num">Rate</th>
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
                      <select className="input-sm" value={it.code} onChange={(e) => update(l.id, { code: e.target.value })}>
                        {items.map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <br />
                      <small>
                        {it.code}
                        {it.unit ? ` · per ${it.unit}` : ''}
                      </small>
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
                    <td className="num">{it.rate ? amount(it.rate) : <span className="muted">on request</span>}</td>
                    <td className="num">
                      <b>{amount(l.qty * it.rate)}</b>
                    </td>
                    <td>
                      <input
                        className="input-sm"
                        type="date"
                        min={header.poDate || undefined}
                        value={l.date}
                        onChange={(e) => update(l.id, { date: e.target.value })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
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
            type="button"
            className="btn btn-ghost addline"
            onClick={() => setLines((ls) => [...ls, { id: nextId++, code: items[0].code, qty: 1, date: ls[ls.length - 1]?.date ?? '' }])}
          >
            ＋ Add line
          </button>
          <div className="totals">
            <div>
              <span>Sub-total</span>
              <b>{rupees(subTotal)}</b>
            </div>
            <div>
              <span>GST @ {GST_RATE * 100}% (est.)</span>
              <b>{rupees(gst)}</b>
            </div>
            <div className="grand">
              <span>PO value</span>
              <span>{rupees(subTotal + gst)}</span>
            </div>
          </div>
          {error && (
            <p className="form-error" role="alert" style={{ marginTop: '1rem' }}>
              {error}
            </p>
          )}
          <div className="btn-row">
            <span className="spacer" />
            <button type="button" className="btn btn-ghost" onClick={saveDraft} disabled={busy}>
              Save draft
            </button>
            <button type="submit" className="btn btn-grad" disabled={busy}>
              {busy ? 'Submitting to SAP…' : 'Submit to Sufalam →'}
            </button>
          </div>
          <p className="form-note">
            Your PO is saved in SAP as a draft sales order. On approval by Sufalam, a Sales Order is created and you'll see
            the confirmed delivery dates under My Orders.
          </p>
        </div>
      </Card>
    </form>
  )
}
