import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Topbar } from '../components/AppLayout'
import { Async, Card, Tag } from '../components/ui'
import { DateInput } from '../components/DateInput'
import { ItemPicker } from '../components/ItemPicker'
import { useCustomer } from '../components/header'
import { useToast } from '../components/toast'
import { PRICE_UNAVAILABLE, todayIso, type SalesItem } from '../api/portal'
import { errorMessage, getSalesItems, submitPurchaseOrder } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { amount, fmtDate, rupees } from '../utils/format'

/** Indicative only — SAP applies the actual tax codes when Sufalam approves the order. */
const GST_RATE = 0.18
/** Saved drafts live on this device only (localStorage), one list per customer. */
const DRAFTS_KEY = 'sufalam.poDrafts'
/** Older builds kept a single draft under this key; it is migrated into the list. */
const LEGACY_DRAFT_KEY = 'sufalam.poDraft'
const MAX_PDF_MB = 5

interface Line {
  id: number
  code: string
  qty: number
  date: string
  /** Rate box contents. Prefilled with the SAP price-list rate (when there is one); the customer may change it. Empty = use the SAP rate. */
  manualRate: string
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

type DraftLine = Omit<Line, 'id'>

interface SavedDraft {
  id: string
  savedAt: string
  header: Header
  lines: DraftLine[]
}

const loadDrafts = (cardCode: string): SavedDraft[] => {
  try {
    const raw = localStorage.getItem(`${DRAFTS_KEY}.${cardCode}`)
    const list = raw ? (JSON.parse(raw) as SavedDraft[]) : []
    const legacy = localStorage.getItem(`${LEGACY_DRAFT_KEY}.${cardCode}`)
    if (legacy) {
      const d = JSON.parse(legacy) as { header: Header; lines: DraftLine[] }
      list.unshift({ id: `legacy-${Date.now()}`, savedAt: new Date().toISOString(), header: d.header, lines: d.lines })
      localStorage.setItem(`${DRAFTS_KEY}.${cardCode}`, JSON.stringify(list))
      localStorage.removeItem(`${LEGACY_DRAFT_KEY}.${cardCode}`)
    }
    return list.map((d) => ({ ...d, lines: d.lines.map((l) => ({ ...l, manualRate: l.manualRate ?? '' })) }))
  } catch {
    return []
  }
}

/** Throws when browser storage is unavailable. */
const writeDrafts = (cardCode: string, list: SavedDraft[]) =>
  localStorage.setItem(`${DRAFTS_KEY}.${cardCode}`, JSON.stringify(list))

const savedAtText = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
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
              <POWorkspace items={list} />
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

/** Saved-drafts list + the PO form. Editing a draft loads it into the form; saving again updates that draft. */
function POWorkspace({ items }: { items: SalesItem[] }) {
  const customer = useCustomer()
  const toast = useToast()
  const [drafts, setDrafts] = useState<SavedDraft[]>(() => loadDrafts(customer.code))
  const [editingId, setEditingId] = useState<string | null>(null)
  /** Bumped to remount the form with fresh initial values. */
  const [formKey, setFormKey] = useState(0)

  const byCode = useMemo(() => new Map(items.map((i) => [i.code, i])), [items])
  const draftValue = (d: SavedDraft) =>
    d.lines.reduce((s, l) => {
      const rate = l.manualRate.trim() ? Number(l.manualRate) : byCode.get(l.code)?.rate
      const amt = (rate ?? 0) * l.qty
      return s + (Number.isFinite(amt) && amt > 0 ? amt : 0)
    }, 0)

  const persist = (next: SavedDraft[]) => {
    writeDrafts(customer.code, next)
    setDrafts(next)
  }

  const startNew = () => {
    setEditingId(null)
    setFormKey((k) => k + 1)
  }

  const edit = (id: string) => {
    setEditingId(id)
    setFormKey((k) => k + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const remove = (d: SavedDraft) => {
    const po = d.header.poNumber.trim()
    if (!window.confirm(`Delete the saved draft${po ? ` for PO ${po}` : ''}?`)) return
    try {
      persist(drafts.filter((x) => x.id !== d.id))
      if (editingId === d.id) startNew()
      toast.success('Draft deleted', 'The saved draft was removed from this device.')
    } catch {
      toast.error('Could not delete draft', 'Browser storage is unavailable.')
    }
  }

  const save = (header: Header, lines: DraftLine[]) => {
    const id = editingId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const draft: SavedDraft = { id, savedAt: new Date().toISOString(), header, lines }
    try {
      persist([draft, ...drafts.filter((x) => x.id !== id)])
      setEditingId(id)
      toast.success(
        editingId ? 'Draft updated' : 'Draft saved',
        'Find it under Saved drafts on this page. Attach the PDF again before submitting.',
      )
    } catch {
      toast.error('Could not save draft', 'Browser storage is unavailable.')
    }
  }

  const submitted = () => {
    if (!editingId) return
    try {
      persist(drafts.filter((x) => x.id !== editingId))
    } catch {
      /* ignore */
    }
  }

  const editing = drafts.find((d) => d.id === editingId) ?? null

  return (
    <>
      {drafts.length > 0 && (
        <Card title="Saved drafts" className="mb" actions={<span className="hint">saved on this device · not yet sent to Sufalam</span>}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PO number</th>
                  <th>PO date</th>
                  <th className="num">Lines</th>
                  <th className="num">Value (excl. GST)</th>
                  <th>Last saved</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <b>{d.header.poNumber.trim() || 'Untitled draft'}</b>
                      {d.id === editingId && (
                        <>
                          {' '}
                          <Tag tone="p">Editing</Tag>
                        </>
                      )}
                    </td>
                    <td>{fmtDate(d.header.poDate)}</td>
                    <td className="num">{d.lines.length}</td>
                    <td className="num">{rupees(draftValue(d))}</td>
                    <td>{savedAtText(d.savedAt)}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="linkbtn" onClick={() => edit(d.id)} disabled={d.id === editingId}>
                        ✎ Edit
                      </button>{' '}
                      <button type="button" className="linkbtn" onClick={() => remove(d)}>
                        ✕ Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <POForm
        key={formKey}
        items={items}
        draft={editing}
        onNew={editingId ? startNew : undefined}
        onSaveDraft={save}
        onSubmitted={submitted}
      />
    </>
  )
}

function POForm({
  items,
  draft,
  onNew,
  onSaveDraft,
  onSubmitted,
}: {
  items: SalesItem[]
  draft: SavedDraft | null
  onNew?: () => void
  onSaveDraft: (header: Header, lines: DraftLine[]) => void
  onSubmitted: () => void
}) {
  const customer = useCustomer()
  const toast = useToast()
  const navigate = useNavigate()

  // Only the draft the form was mounted with is loaded; the parent remounts the form (new key) to load another.
  const [saved] = useState(() => (draft ? { header: draft.header, lines: draft.lines.map((l) => ({ ...l, id: nextId++ })) } : null))
  const blankHeader: Header = {
    poNumber: '',
    poDate: todayIso(),
    deliveryTerms: 'FOR Destination',
    freight: "To Sufalam's account",
    shipTo: customer.shipTo[0]?.code ?? '',
    remarks: '',
  }
  const [header, setHeader] = useState<Header>(saved?.header ?? blankHeader)
  const sapRateText = (code: string) => {
    const r = items.find((i) => i.code === code)?.rate
    return r == null ? '' : String(r)
  }
  const [lines, setLines] = useState<Line[]>(
    saved?.lines ?? [{ id: nextId++, code: items[0].code, qty: 1, date: '', manualRate: sapRateText(items[0].code) }],
  )
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const byCode = useMemo(() => new Map(items.map((i) => [i.code, i])), [items])
  const item = (code: string) => byCode.get(code) ?? items[0]
  const update = (id: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const setH = (patch: Partial<Header>) => setHeader((h) => ({ ...h, ...patch }))

  const validQty = (q: number) => Number.isFinite(q) && q > 0
  /** The rate in the box, else the SAP price-list rate when the box is empty; null when there's no valid positive rate. */
  const lineRate = (l: Line) => {
    if (l.manualRate.trim() === '') return byCode.get(l.code)?.rate ?? null
    const r = Number(l.manualRate)
    return Number.isFinite(r) && r > 0 ? r : null
  }
  /** True when the line's rate is not the SAP price-list rate (none maintained, or the customer changed it). */
  const isManual = (l: Line) => {
    const sap = byCode.get(l.code)?.rate
    return sap == null || lineRate(l) !== sap
  }
  /** Quantity × rate, or null when the line can't be priced (no rate or invalid quantity). */
  const lineAmount = (l: Line) => {
    const rate = lineRate(l)
    const amt = rate != null && validQty(l.qty) ? l.qty * rate : NaN
    return Number.isFinite(amt) && amt > 0 ? amt : null
  }
  const manualLines = lines.flatMap((l, i) => (isManual(l) ? [i + 1] : []))
  const allPriced = lines.every((l) => lineAmount(l) != null)
  const subTotal = lines.reduce((s, l) => s + (lineAmount(l) ?? 0), 0)
  const gst = Math.round(subTotal * GST_RATE)

  const validate = () => {
    if (!header.poNumber.trim()) return 'Enter your PO number.'
    if (!header.poDate) return 'Enter the PO date.'
    if (!file) return 'Attach a PDF copy of your PO.'
    if (file.size > MAX_PDF_MB * 1048576) return `PO copy must be ${MAX_PDF_MB} MB or smaller.`
    if (customer.shipTo.length && !header.shipTo) return 'Choose a ship-to address.'
    if (!lines.length) return 'Add at least one PO line.'
    for (const [i, l] of lines.entries()) {
      const it = byCode.get(l.code)
      if (!it) return `Line ${i + 1}: choose an item.`
      if (!validQty(l.qty)) return `Line ${i + 1}: quantity must be greater than zero.`
      if (lineRate(l) == null) return `Line ${i + 1} (${it.name}): ${l.manualRate.trim() ? 'the rate must be greater than zero.' : PRICE_UNAVAILABLE}`
      if (lineAmount(l) == null) return `Line ${i + 1} (${it.name}): the amount could not be calculated. Check the quantity.`
      if (!l.date) return `Line ${i + 1}: choose an expected delivery date.`
      if (l.date < header.poDate) return `Line ${i + 1}: expected delivery can't be before the PO date.`
    }
    return ''
  }

  const saveDraft = () => onSaveDraft(header, lines.map(({ code, qty, date, manualRate }) => ({ code, qty, date, manualRate })))

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
          lines: lines.map((l) => ({
            itemCode: l.code,
            quantity: l.qty,
            expectedDate: l.date,
            ...(isManual(l) ? { unitPrice: lineRate(l) ?? undefined } : {}),
          })),
        },
        file,
      )

      onSubmitted()
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
      <Card
        title={draft ? `PO header · editing draft${draft.header.poNumber.trim() ? ` ${draft.header.poNumber.trim()}` : ''}` : 'PO header'}
        className="mb"
        actions={
          onNew && (
            <button type="button" className="linkbtn" onClick={onNew}>
              ＋ New PO
            </button>
          )
        }
      >
        <div className="bd">
          <div className="grid3">
            <div className="field">
              <label>Your PO number *</label>
              <input placeholder="EV/2026/095" maxLength={100} value={header.poNumber} onChange={(e) => setH({ poNumber: e.target.value })} />
            </div>
            <div className="field">
              <label>PO date *</label>
              <DateInput aria-label="PO date" value={header.poDate} onChange={(poDate) => setH({ poDate })} />
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

      <Card title="PO lines" actions={<span className="hint">rates prefilled from SAP price list #{customer.priceList} where available; you can edit them</span>}>
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
                      <ItemPicker items={items} value={it.code} onChange={(code) => update(l.id, { code, manualRate: sapRateText(code) })} />
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
                    <td className="num">
                      <input
                        className="input-sm rate-input"
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder={it.rate != null ? String(it.rate) : 'Enter rate'}
                        aria-label={`Rate for ${it.name}`}
                        title={it.rate != null ? `SAP price-list rate: ${amount(it.rate)}` : PRICE_UNAVAILABLE}
                        value={l.manualRate}
                        onChange={(e) => update(l.id, { manualRate: e.target.value })}
                      />
                      <br />
                      <small>{isManual(l) ? 'manual rate' : 'price list'}</small>
                    </td>
                    <td className="num">
                      <b>{lineAmount(l) != null ? amount(lineAmount(l)!) : '—'}</b>
                    </td>
                    <td>
                      <DateInput
                        className="input-sm"
                        aria-label="Expected delivery"
                        min={header.poDate || undefined}
                        value={l.date}
                        onChange={(date) => update(l.id, { date })}
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
            onClick={() =>
              setLines((ls) => [...ls, { id: nextId++, code: items[0].code, qty: 1, date: ls[ls.length - 1]?.date ?? '', manualRate: sapRateText(items[0].code) }])
            }
          >
            ＋ Add line
          </button>
          {manualLines.length > 0 && (
            <p className="hint" role="status" style={{ marginTop: '1rem' }}>
              {manualLines.length === 1 ? `Line ${manualLines[0]}: ` : `Lines ${manualLines.join(', ')}: `}
              {manualLines.length === 1 ? 'the rate is' : 'the rates are'} entered manually (no price, or a different price, in
              your SAP price list #{customer.priceList}). Sufalam checks manual rates when it approves the order.
            </p>
          )}
          <div className="totals">
            <div>
              <span>Sub-total</span>
              <b>{allPriced ? rupees(subTotal) : '—'}</b>
            </div>
            <div>
              <span>GST @ {GST_RATE * 100}% (est.)</span>
              <b>{allPriced ? rupees(gst) : '—'}</b>
            </div>
            <div className="grand">
              <span>PO value</span>
              <span>{allPriced ? rupees(subTotal + gst) : '—'}</span>
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
              {draft ? 'Update draft' : 'Save draft'}
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
