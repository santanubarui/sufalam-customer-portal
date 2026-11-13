/*
 * Portal data, read from / written to SAP Business One Service Layer.
 *
 *   Customer           ← BusinessPartners(CardCode)
 *   Purchase orders    → Drafts (DocObjectCode oOrders)  — "Awaiting approval" until Sufalam converts it
 *   My orders          ← Orders + open order Drafts
 *   Proforma invoices  ← DownPayments (A/R down payment requests, open)
 *   Payments           ← IncomingPayments
 *   In-transit         ← DeliveryNotes (open); acknowledgement is stamped into Comments
 *   Statement          ← Invoices, CreditNotes, DownPayments (invoices), IncomingPayments
 */
import { lit, odata, sapList, sapRequest, SapError } from './sap'

export type TagTone = 'g' | 'p' | 'a' | 'r' | 'n'

/* ---------- shared helpers ---------- */

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
/** "2025-11-18T00:00:00Z" -> "2025-11-18" */
export const isoDay = (d: string | null | undefined) => (d ? d.slice(0, 10) : '')
export const todayIso = () => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}
const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000)

interface DocLine {
  LineNum: number
  ItemCode: string
  ItemDescription: string
  Quantity: number
  ShipDate?: string
  MeasureUnit?: string | null
  UoMCode?: string | null
  LineTotal?: number
  BaseType?: number
  BaseEntry?: number | null
}

const unitOf = (l: DocLine) => l.MeasureUnit || (l.UoMCode && l.UoMCode !== 'Manual' ? l.UoMCode : '') || ''
const fmtQty = (q: number) => q.toLocaleString('en-IN', { maximumFractionDigits: 3 })

function lineSummary(lines: DocLine[] | undefined) {
  const ls = lines ?? []
  if (!ls.length) return { item: '—', qty: '' }
  const first = ls[0]
  const more = ls.length > 1 ? ` +${ls.length - 1} more` : ''
  const total = ls.reduce((s, l) => s + n(l.Quantity), 0)
  const sameUnit = ls.every((l) => unitOf(l) === unitOf(first))
  return {
    item: `${first.ItemDescription || first.ItemCode}${more}`,
    qty: `${fmtQty(ls.length > 1 && !sameUnit ? n(first.Quantity) : total)} ${unitOf(first)}`.trim(),
  }
}

/* =====================================================================
 * Customer (Business Partner)
 * ===================================================================*/

export interface ShipToAddress {
  code: string
  label: string
}

export interface Customer {
  code: string
  name: string
  initials: string
  state: string
  gstin: string
  creditLimit: number
  balance: number
  openOrdersBalance: number
  available: number
  priceList: number
  /** SAP branch (BPLID) the customer is assigned to; documents must be posted to it. */
  branch: number | null
  shipTo: ShipToAddress[]
}

interface BPAddress {
  AddressName: string
  AddressType: 'bo_BillTo' | 'bo_ShipTo'
  Street?: string | null
  Block?: string | null
  City?: string | null
  State?: string | null
  ZipCode?: string | null
  GSTIN?: string | null
}

interface BusinessPartner {
  CardCode: string
  CardName: string
  CardType: string
  CurrentAccountBalance: number
  CreditLimit: number
  OpenOrdersBalance: number
  OpenDeliveryNotesBalance: number
  PriceListNum: number
  BPAddresses?: BPAddress[]
  BPBranchAssignment?: { BPLID: number; DisabledForBP: 'tYES' | 'tNO' }[]
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?'

export async function getCustomer(cardCode: string): Promise<Customer> {
  let bp: BusinessPartner
  try {
    bp = await sapRequest<BusinessPartner>(
      `BusinessPartners(${lit(cardCode)})?$select=CardCode,CardName,CardType,CurrentAccountBalance,CreditLimit,OpenOrdersBalance,OpenDeliveryNotesBalance,PriceListNum,BPAddresses,BPBranchAssignment`,
    )
  } catch (e) {
    if (e instanceof SapError && e.status === 404) {
      throw new SapError(404, `Customer code "${cardCode}" was not found in SAP.`)
    }
    throw e
  }
  if (bp.CardType !== 'cCustomer') throw new SapError(400, `"${cardCode}" is not a customer account in SAP.`)

  const addrs = bp.BPAddresses ?? []
  const billTo = addrs.find((a) => a.AddressType === 'bo_BillTo') ?? addrs[0]
  const shipTo = addrs
    .filter((a) => a.AddressType === 'bo_ShipTo')
    .map((a) => ({
      code: a.AddressName,
      label: [a.AddressName, a.City, a.State].filter(Boolean).join(' — '),
    }))

  const balance = n(bp.CurrentAccountBalance)
  const creditLimit = n(bp.CreditLimit)
  const openOrdersBalance = n(bp.OpenOrdersBalance) + n(bp.OpenDeliveryNotesBalance)

  return {
    code: bp.CardCode,
    name: bp.CardName,
    initials: initialsOf(bp.CardName),
    state: [billTo?.City, billTo?.State].filter(Boolean).join(', '),
    gstin: billTo?.GSTIN ?? '',
    creditLimit,
    balance,
    openOrdersBalance,
    available: Math.max(0, creditLimit - balance - openOrdersBalance),
    priceList: bp.PriceListNum,
    branch: bp.BPBranchAssignment?.find((b) => b.DisabledForBP !== 'tYES')?.BPLID ?? null,
    shipTo,
  }
}

/* =====================================================================
 * Orders (Sales Orders + PO drafts awaiting approval)
 * ===================================================================*/

export type OrderStatus = 'Awaiting approval' | 'Open' | 'Closed' | 'Cancelled'

export const statusTone: Record<OrderStatus, TagTone> = {
  'Awaiting approval': 'a',
  Open: 'g',
  Closed: 'n',
  Cancelled: 'r',
}

export interface Order {
  key: string
  docEntry: number
  so: string | null
  po: string
  item: string
  qty: string
  value: number
  terms: string
  docDate: string
  /** customer's requested date (line ship date) */
  expected: string | null
  /** delivery date confirmed by Sufalam (sales order due date) */
  confirmed: string | null
  status: OrderStatus
  hasAttachment: boolean
}

interface SapDocument {
  DocEntry: number
  DocNum: number
  NumAtCard: string | null
  DocDate: string
  DocDueDate: string
  DocTotal: number
  PaidToDate?: number
  DocumentStatus: 'bost_Open' | 'bost_Close' | 'bost_Paid' | 'bost_Delivered'
  Cancelled?: 'tYES' | 'tNO'
  Comments: string | null
  AttachmentEntry?: number | null
  DocumentLines?: DocLine[]
}

const DOC_SELECT =
  'DocEntry,DocNum,NumAtCard,DocDate,DocDueDate,DocTotal,DocumentStatus,Cancelled,Comments,AttachmentEntry,DocumentLines'

const termsFrom = (comments: string | null) => comments?.match(/Delivery terms:\s*([^·|\n]+)/i)?.[1].trim() ?? '—'

function earliestShipDate(lines: DocLine[] | undefined) {
  const dates = (lines ?? []).map((l) => isoDay(l.ShipDate)).filter(Boolean).sort()
  return dates[0] ?? null
}

function mapOrder(d: SapDocument, isDraft: boolean): Order {
  const { item, qty } = lineSummary(d.DocumentLines)
  const status: OrderStatus = isDraft
    ? 'Awaiting approval'
    : d.Cancelled === 'tYES'
      ? 'Cancelled'
      : d.DocumentStatus === 'bost_Open'
        ? 'Open'
        : 'Closed'
  return {
    key: `${isDraft ? 'D' : 'O'}${d.DocEntry}`,
    docEntry: d.DocEntry,
    so: isDraft ? null : `SO-${d.DocNum}`,
    po: d.NumAtCard || (isDraft ? `Draft ${d.DocNum}` : '—'),
    item,
    qty,
    value: n(d.DocTotal),
    terms: termsFrom(d.Comments),
    docDate: isoDay(d.DocDate),
    expected: earliestShipDate(d.DocumentLines) ?? (isDraft ? isoDay(d.DocDueDate) : null),
    confirmed: isDraft ? null : isoDay(d.DocDueDate),
    status,
    hasAttachment: !!d.AttachmentEntry,
  }
}

export async function getOrders(cardCode: string, signal?: AbortSignal): Promise<Order[]> {
  const [drafts, orders] = await Promise.all([
    sapList<SapDocument>(
      odata('Drafts', {
        select: DOC_SELECT,
        filter: `CardCode eq ${lit(cardCode)} and DocObjectCode eq 'oOrders' and DocumentStatus eq 'bost_Open'`,
        orderby: 'DocEntry desc',
      }),
      { pageSize: 50, maxPages: 1, signal },
    ),
    sapList<SapDocument>(
      odata('Orders', { select: DOC_SELECT, filter: `CardCode eq ${lit(cardCode)}`, orderby: 'DocEntry desc' }),
      { pageSize: 50, maxPages: 2, signal },
    ),
  ])
  return [...drafts.map((d) => mapOrder(d, true)), ...orders.map((d) => mapOrder(d, false))]
}

/* ---------- create PO (as a Sales Order draft) ---------- */

export interface SalesItem {
  code: string
  name: string
  unit: string
  rate: number
}

interface SapItem {
  ItemCode: string
  ItemName: string
  SalesUnit: string | null
  ItemPrices?: { PriceList: number; Price: number }[]
}

export async function getSalesItems(priceList: number, signal?: AbortSignal): Promise<SalesItem[]> {
  const items = await sapList<SapItem>(
    odata('Items', {
      select: 'ItemCode,ItemName,SalesUnit,ItemPrices',
      filter: "SalesItem eq 'tYES' and Valid eq 'tYES' and Frozen eq 'tNO' and ItemType ne 'itFixedAssets'",
      orderby: 'ItemName',
    }),
    { pageSize: 100, maxPages: 5, signal },
  )
  return items.map((i) => ({
    code: i.ItemCode,
    name: i.ItemName?.trim() || i.ItemCode, // a few SAP items have no name — show the code instead
    unit: i.SalesUnit ?? '',
    rate: n(i.ItemPrices?.find((p) => p.PriceList === priceList)?.Price),
  }))
}

/** Uploads files to SAP attachments (Attachments2) and returns the AbsoluteEntry. */
export async function uploadAttachment(files: File[]): Promise<number> {
  const form = new FormData()
  files.forEach((f) => form.append('files', f, f.name))
  const res = await sapRequest<{ AbsoluteEntry: number | string }>('Attachments2', { method: 'POST', body: form })
  return Number(res.AbsoluteEntry)
}

export interface NewPurchaseOrder {
  cardCode: string
  /** customer's SAP branch (BPLID); required in multi-branch companies */
  branch: number | null
  poNumber: string
  poDate: string
  deliveryTerms: string
  freight: string
  shipTo: string
  remarks: string
  lines: { itemCode: string; quantity: number; expectedDate: string }[]
  attachmentEntry?: number
}

export async function createPurchaseOrderDraft(po: NewPurchaseOrder) {
  const dates = po.lines.map((l) => l.expectedDate).sort()
  const dueDate = dates[dates.length - 1]
  const comments = [`Portal PO ${po.poNumber}`, `Delivery terms: ${po.deliveryTerms}`, `Freight: ${po.freight}`, po.remarks.trim()]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 254)

  try {
    return await sapRequest<{ DocEntry: number; DocNum: number }>('Drafts', {
      method: 'POST',
      body: {
        DocObjectCode: 'oOrders',
        CardCode: po.cardCode,
        ...(po.branch != null ? { BPL_IDAssignedToInvoice: po.branch } : {}),
        NumAtCard: po.poNumber,
        DocDate: po.poDate,
        TaxDate: po.poDate,
        DocDueDate: dueDate,
        ...(po.shipTo ? { ShipToCode: po.shipTo } : {}),
        ...(po.attachmentEntry ? { AttachmentEntry: po.attachmentEntry } : {}),
        Comments: comments,
        DocumentLines: po.lines.map((l) => ({ ItemCode: l.itemCode, Quantity: l.quantity, ShipDate: l.expectedDate })),
      },
    })
  } catch (e) {
    // Sufalam uses one numbering series per day and branch; SAP rejects dates with no open series.
    if (e instanceof SapError && /numbering series/i.test(e.message)) {
      throw new SapError(
        e.status,
        `SAP has no document numbering series open for ${po.poDate}. Please ask Sufalam to open the sales order series for this date, then submit again.`,
        e.code,
      )
    }
    // SAP answers 404 / -2028 when a referenced master record (item, ship-to address, attachment) doesn't exist
    if (e instanceof SapError && (e.status === 404 || String(e.code) === '-2028')) {
      throw new SapError(
        e.status,
        'One of the items, the ship-to address or the attachment on this PO no longer exists in SAP. Please refresh the page and try again.',
        e.code,
      )
    }
    throw e
  }
}

/* =====================================================================
 * Receivables: open invoices, PIs, payments
 * ===================================================================*/

export interface OpenInvoice {
  docEntry: number
  invoice: string
  date: string
  due: string
  original: number
  balance: number
  daysOverdue: number
}

export async function getOpenInvoices(cardCode: string, signal?: AbortSignal): Promise<OpenInvoice[]> {
  const docs = await sapList<SapDocument>(
    odata('Invoices', {
      select: 'DocEntry,DocNum,DocDate,DocDueDate,DocTotal,PaidToDate',
      filter: `CardCode eq ${lit(cardCode)} and DocumentStatus eq 'bost_Open' and CancelStatus eq 'csNo'`,
      orderby: 'DocDueDate',
    }),
    { pageSize: 100, maxPages: 10, signal },
  )
  const today = todayIso()
  return docs.map((d) => ({
    docEntry: d.DocEntry,
    invoice: `INV-${d.DocNum}`,
    date: isoDay(d.DocDate),
    due: isoDay(d.DocDueDate),
    original: n(d.DocTotal),
    balance: n(d.DocTotal) - n(d.PaidToDate),
    daysOverdue: Math.max(0, daysBetween(isoDay(d.DocDueDate), today)),
  }))
}

export interface ProformaInvoice {
  docEntry: number
  pi: string
  ref: string
  details: string
  amount: number
  lines: { item: string; qty: string; total: number }[]
}

export async function getPendingProformas(cardCode: string, signal?: AbortSignal): Promise<ProformaInvoice[]> {
  const docs = await sapList<SapDocument>(
    odata('DownPayments', {
      select: 'DocEntry,DocNum,NumAtCard,DocDate,DocDueDate,DocTotal,PaidToDate,Comments,DocumentLines',
      filter: `CardCode eq ${lit(cardCode)} and DocumentStatus eq 'bost_Open' and DownPaymentType eq 'dptRequest'`,
      orderby: 'DocDueDate',
    }),
    { pageSize: 50, maxPages: 2, signal },
  )
  return docs.map((d) => {
    const { item, qty } = lineSummary(d.DocumentLines)
    const baseSo = d.DocumentLines?.find((l) => l.BaseType === 17)?.BaseEntry
    return {
      docEntry: d.DocEntry,
      pi: `PI-${d.DocNum}`,
      ref: baseSo ? `sales order #${baseSo}` : d.NumAtCard ? `PO ${d.NumAtCard}` : 'your order',
      details: [`Raised ${isoDay(d.DocDate)}`, `due ${isoDay(d.DocDueDate)}`, `${item} · ${qty}`, d.Comments]
        .filter(Boolean)
        .join(' · '),
      amount: n(d.DocTotal) - n(d.PaidToDate),
      lines: (d.DocumentLines ?? []).map((l) => ({
        item: l.ItemDescription || l.ItemCode,
        qty: `${fmtQty(n(l.Quantity))} ${unitOf(l)}`.trim(),
        total: n(l.LineTotal),
      })),
    }
  })
}

export interface Payment {
  docEntry: number
  receipt: string
  date: string
  ref: string
  mode: string
  txnRef: string
  amount: number
  onAccount: boolean
  cancelled: boolean
}

interface SapPayment {
  DocEntry: number
  DocNum: number
  DocDate: string
  CashSum: number
  TransferSum: number
  TransferReference: string | null
  Cancelled: 'tYES' | 'tNO'
  PaymentInvoices?: { DocEntry: number; SumApplied: number; InvoiceType: string }[]
  PaymentChecks?: { CheckSum: number }[]
  PaymentCreditCards?: { CreditSum: number }[]
}

function mapPayment(p: SapPayment): Payment {
  const checks = (p.PaymentChecks ?? []).reduce((s, c) => s + n(c.CheckSum), 0)
  const cards = (p.PaymentCreditCards ?? []).reduce((s, c) => s + n(c.CreditSum), 0)
  const parts = [
    ['Bank transfer', n(p.TransferSum)],
    ['Cash', n(p.CashSum)],
    ['Cheque', checks],
    ['Card', cards],
  ].filter(([, v]) => (v as number) > 0) as [string, number][]
  const docs = p.PaymentInvoices ?? []
  return {
    docEntry: p.DocEntry,
    receipt: `ORCT-${p.DocNum}`,
    date: isoDay(p.DocDate),
    ref: docs.length ? `Against ${docs.length} document${docs.length > 1 ? 's' : ''}` : 'Advance on account',
    mode: parts.length === 1 ? parts[0][0] : parts.length ? 'Mixed' : '—',
    txnRef: p.TransferReference || '—',
    amount: parts.reduce((s, [, v]) => s + v, 0),
    onAccount: docs.length === 0,
    cancelled: p.Cancelled === 'tYES',
  }
}

const PAYMENT_SELECT =
  'DocEntry,DocNum,DocDate,CashSum,TransferSum,TransferReference,Cancelled,PaymentInvoices,PaymentChecks,PaymentCreditCards'

export async function getPayments(cardCode: string, signal?: AbortSignal): Promise<Payment[]> {
  const docs = await sapList<SapPayment>(
    odata('IncomingPayments', { select: PAYMENT_SELECT, filter: `CardCode eq ${lit(cardCode)}`, orderby: 'DocEntry desc' }),
    { pageSize: 100, maxPages: 1, signal },
  )
  return docs.map(mapPayment)
}

/* =====================================================================
 * Deliveries (in-transit + acknowledgement)
 * ===================================================================*/

export interface Delivery {
  docEntry: number
  dn: string
  ref: string
  date: string
  value: number
  item: string
  qty: string
  comments: string
  attachmentEntry: number | null
  ack: { date: string; note: string } | null
}

const ACK_TAG = '[Portal ACK'
const parseAck = (c: string | null) => {
  const m = c?.match(/\[Portal ACK (\d{4}-\d{2}-\d{2})\]\s*([^|]*)/)
  return m ? { date: m[1], note: m[2].trim() } : null
}

function mapDelivery(d: SapDocument): Delivery {
  const { item, qty } = lineSummary(d.DocumentLines)
  return {
    docEntry: d.DocEntry,
    dn: `DLN-${d.DocNum}`,
    ref: d.NumAtCard ? `PO ${d.NumAtCard}` : '',
    date: isoDay(d.DocDate),
    value: n(d.DocTotal),
    item,
    qty,
    comments: d.Comments ?? '',
    attachmentEntry: d.AttachmentEntry ?? null,
    ack: parseAck(d.Comments),
  }
}

const DELIVERY_SELECT = 'DocEntry,DocNum,NumAtCard,DocDate,DocTotal,Comments,AttachmentEntry,DocumentLines'

/** One delivery, only if it belongs to `cardCode` (otherwise reported as not found). */
export async function getDelivery(cardCode: string, docEntry: number): Promise<Delivery> {
  const notFound = () => new SapError(404, `Delivery ${docEntry} was not found for your account.`)
  let d: SapDocument & { CardCode: string; Cancelled?: 'tYES' | 'tNO' }
  try {
    d = await sapRequest(`DeliveryNotes(${docEntry})?$select=CardCode,Cancelled,DocumentStatus,${DELIVERY_SELECT}`)
  } catch (e) {
    if (e instanceof SapError && e.status === 404) throw notFound()
    throw e
  }
  if (d.CardCode !== cardCode || d.Cancelled === 'tYES') throw notFound()
  return mapDelivery(d)
}

export async function getDeliveries(cardCode: string, signal?: AbortSignal) {
  const select = DELIVERY_SELECT
  const [open, acked] = await Promise.all([
    sapList<SapDocument>(
      odata('DeliveryNotes', {
        select,
        filter: `CardCode eq ${lit(cardCode)} and DocumentStatus eq 'bost_Open' and Cancelled eq 'tNO'`,
        orderby: 'DocEntry desc',
      }),
      { pageSize: 50, maxPages: 1, signal },
    ),
    sapList<SapDocument>(
      odata('DeliveryNotes', {
        select,
        filter: `CardCode eq ${lit(cardCode)} and contains(Comments, ${lit(ACK_TAG)})`,
        orderby: 'DocEntry desc',
        top: 10,
      }),
      { pageSize: 10, maxPages: 1, signal },
    ),
  ])
  return {
    inTransit: open.map(mapDelivery).filter((d) => !d.ack),
    acknowledged: acked.map(mapDelivery),
  }
}

export async function acknowledgeDelivery(
  d: Delivery,
  input: { receivedOn: string; condition: string; remarks: string; attachmentEntry?: number },
) {
  const stamp = `${ACK_TAG} ${input.receivedOn}] ${input.condition}${input.remarks.trim() ? ` — ${input.remarks.trim()}` : ''}`
  const comments = [stamp, d.comments].filter(Boolean).join(' | ').slice(0, 254)
  await sapRequest(`DeliveryNotes(${d.docEntry})`, {
    method: 'PATCH',
    body: {
      Comments: comments,
      ...(input.attachmentEntry && !d.attachmentEntry ? { AttachmentEntry: input.attachmentEntry } : {}),
    },
  })
}

/* =====================================================================
 * Ledger statement
 * ===================================================================*/

export interface LedgerRow {
  date: string
  doc: string
  particulars: string
  debit: number
  credit: number
  balance: number
}

/**
 * Builds the customer statement for [from, to].
 * Movements come from A/R invoices, down payment invoices, credit memos and incoming payments.
 * The opening balance is derived backwards from the live BP balance, so it always reconciles to SAP's today figure
 * as long as all movements are of those document types.
 */
export async function getLedger(cardCode: string, currentBalance: number, from: string, to: string, signal?: AbortSignal) {
  const since = `DocDate ge ${lit(from)}`
  const cust = `CardCode eq ${lit(cardCode)}`
  const docSel = 'DocEntry,DocNum,DocDate,DocTotal,NumAtCard'
  const opts = { pageSize: 200, maxPages: 15, signal }

  const [inv, dpi, crn, pay] = await Promise.all([
    sapList<SapDocument>(odata('Invoices', { select: docSel, filter: `${cust} and ${since} and CancelStatus eq 'csNo'` }), opts),
    sapList<SapDocument>(
      odata('DownPayments', { select: docSel, filter: `${cust} and ${since} and DownPaymentType eq 'dptInvoice' and CancelStatus eq 'csNo'` }),
      opts,
    ),
    sapList<SapDocument>(odata('CreditNotes', { select: docSel, filter: `${cust} and ${since} and CancelStatus eq 'csNo'` }), opts),
    sapList<SapPayment>(odata('IncomingPayments', { select: PAYMENT_SELECT, filter: `${cust} and ${since} and Cancelled eq 'tNO'` }), opts),
  ])

  const moves: Omit<LedgerRow, 'balance'>[] = [
    ...inv.map((d) => ({ date: isoDay(d.DocDate), doc: `INV-${d.DocNum}`, particulars: `A/R Invoice${d.NumAtCard ? ` · PO ${d.NumAtCard}` : ''}`, debit: n(d.DocTotal), credit: 0 })),
    ...dpi.map((d) => ({ date: isoDay(d.DocDate), doc: `DPI-${d.DocNum}`, particulars: 'Down payment invoice', debit: n(d.DocTotal), credit: 0 })),
    ...crn.map((d) => ({ date: isoDay(d.DocDate), doc: `CN-${d.DocNum}`, particulars: 'A/R Credit memo', debit: 0, credit: n(d.DocTotal) })),
    ...pay.map(mapPayment).map((p) => ({ date: p.date, doc: p.receipt, particulars: `Incoming payment · ${p.mode} · ${p.ref}`, debit: 0, credit: p.amount })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.doc.localeCompare(b.doc))

  const netSinceFrom = moves.reduce((s, m) => s + m.debit - m.credit, 0)
  const opening = currentBalance - netSinceFrom

  let bal = opening
  const rows: LedgerRow[] = []
  for (const m of moves) {
    if (m.date > to) break
    bal += m.debit - m.credit
    rows.push({ ...m, balance: bal })
  }
  return { opening, closing: bal, rows }
}
