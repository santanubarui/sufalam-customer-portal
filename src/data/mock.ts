// Sample data mirroring the UI theme prototype. Replace with SAP B1 / API calls.

export type TagTone = 'g' | 'p' | 'a' | 'r' | 'n'

export const customer = {
  code: 'C-10042',
  name: 'Evergreen Polymers',
  initials: 'EP',
  state: 'West Bengal',
}

export const summary = {
  asOn: '13 Jul 2026',
  outstanding: 1842600,
  overdue: 310200,
  overdueCount: 2,
  oldestOverdueDays: 21,
  creditLimit: 2500000,
  available: 657400,
  advances: 120000,
  advanceCount: 1,
  openOrders: 4,
  awaitingApproval: 1,
}

export type OrderStatus = 'Awaiting approval' | 'Confirmed' | 'PI raised' | 'In-Transit' | 'Delivered'

export const statusTone: Record<OrderStatus, TagTone> = {
  'Awaiting approval': 'a',
  Confirmed: 'g',
  'PI raised': 'p',
  'In-Transit': 'p',
  Delivered: 'n',
}

export interface Order {
  so: string | null
  po: string
  item: string
  qty: string
  value: number
  terms: string
  expected: string
  confirmed: string | null
  status: OrderStatus
}

export const orders: Order[] = [
  { so: 'SO-24118', po: 'EV/2026/091', item: 'HDPE Granules N-110', qty: '5 MT', value: 584000, terms: 'FOR Dest.', expected: '18 Jul 2026', confirmed: '19 Jul 2026', status: 'Confirmed' },
  { so: 'SO-24102', po: 'EV/2026/088', item: 'PP Compound G-40', qty: '2.8 MT', value: 326500, terms: 'Ex-Works', expected: '15 Jul 2026', confirmed: '15 Jul 2026', status: 'PI raised' },
  { so: 'SO-24089', po: 'EV/2026/085', item: 'HDPE Granules N-110', qty: '4 MT', value: 464000, terms: 'FOR Dest.', expected: '10 Jul 2026', confirmed: '10 Jul 2026', status: 'In-Transit' },
  { so: null, po: 'EV/2026/094', item: 'Masterbatch MG-2', qty: '0.8 MT', value: 96800, terms: 'FOR Dest.', expected: '22 Jul 2026', confirmed: null, status: 'Awaiting approval' },
  { so: 'SO-24051', po: 'EV/2026/079', item: 'PP Compound G-40', qty: '3 MT', value: 349800, terms: 'FOR Dest.', expected: '28 Jun 2026', confirmed: '30 Jun 2026', status: 'Delivered' },
]

export const attention: { color: string; title: string; amount?: number; note: string }[] = [
  { color: 'var(--purple-600)', title: 'PI-1187 ready for payment', amount: 329240, note: 'Weighment done 12 Jul · pay to release dispatch' },
  { color: 'var(--green-600)', title: 'Invoice INV-8842 in transit', note: 'Vehicle WB-23-C-4581 · acknowledge on receipt' },
  { color: 'var(--red)', title: '2 invoices overdue', amount: 310200, note: 'Oldest 21 days past due date' },
  { color: 'var(--amber)', title: 'Delivery date revised on SO-24118', note: 'Confirmed 19 Jul (was 18 Jul) · email sent' },
]

export interface PriceListItem {
  code: string
  name: string
  rate: number
}

export const priceList: PriceListItem[] = [
  { code: 'ITM-00214', name: 'HDPE Granules N-110', rate: 116000 },
  { code: 'ITM-00378', name: 'Masterbatch MG-2', rate: 121000 },
  { code: 'ITM-00251', name: 'PP Compound G-40', rate: 116600 },
]

export const shipTo = ['Plant 1 — Howrah, WB', 'Warehouse — Dankuni, WB']

export const GST_RATE = 0.18

export interface ProformaInvoice {
  pi: string
  so: string
  details: string
  cta?: string
  amount: number
}

export const pendingPIs: ProformaInvoice[] = [
  { pi: 'PI-1187', so: 'SO-24102', details: 'Weighment 12 Jul 2026 · Slip WB-5521 · Vehicle WB-23-C-4581 · Qty 2.795 MT @ SO rate', cta: 'Pay to release dispatch — delivery auto-posts on payment', amount: 329240 },
  { pi: 'PI-1181', so: 'SO-24118', details: 'Weighment 11 Jul 2026 · Slip WB-5502 · Qty 4.980 MT @ SO rate', amount: 681660 },
]

export const paymentHistory: { date: string; ref: string; mode: string; txn: string; amount: number; receipt: string | null; ok: boolean }[] = [
  { date: '05 Jul 2026', ref: 'PI-1164 · SO-24089', mode: 'NEFT (VA)', txn: 'pay_QX81jd…', amount: 547520, receipt: 'ORCT-30112', ok: true },
  { date: '26 Jun 2026', ref: 'PI-1149 · SO-24051', mode: 'UPI', txn: 'pay_QT55am…', amount: 412764, receipt: 'ORCT-30078', ok: true },
  { date: '26 Jun 2026', ref: 'PI-1149 · SO-24051', mode: 'Net banking', txn: 'pay_QT52hh…', amount: 412764, receipt: null, ok: false },
]

export const inTransit = {
  invoice: 'INV-8842',
  so: 'SO-24089',
  summary: 'HDPE N-110 · 3.985 MT · ₹ 5,47,520 · Vehicle WB-23-C-4581 · e-Way EWB-4411 2233 5566 · Dispatched 12 Jul 2026',
  stages: ['PO approved', 'Weighment & PI', 'Payment received', 'In transit', 'Acknowledged'],
  current: 3,
}

export const acknowledged: { invoice: string; so: string; qty: string; value: number; on: string; tone: TagTone; status: string }[] = [
  { invoice: 'INV-8790', so: 'SO-24051', qty: '2.990', value: 412764, on: '02 Jul 2026 · by R. Sen', tone: 'g', status: 'Acknowledged' },
  { invoice: 'INV-8741', so: 'SO-24012', qty: '4.010', value: 551000, on: '21 Jun 2026 · by R. Sen', tone: 'a', status: 'Ack. with remarks' },
]

export const ageing = [
  { label: '0–30 d', pct: 46, amount: '₹ 8.48 L', color: 'var(--green-600)' },
  { label: '31–60 d', pct: 29, amount: '₹ 5.34 L', color: 'var(--purple-600)' },
  { label: '61–90 d', pct: 17, amount: '₹ 3.13 L', color: '#D69E2E' },
  { label: '90+ d', pct: 8, amount: '₹ 1.47 L', color: 'var(--red)' },
]

export const openInvoices: { invoice: string; date: string; due: string; original: number; balance: number; tone: TagTone; ageing: string }[] = [
  { invoice: 'INV-8842', date: '12 Jul 26', due: '11 Aug 26', original: 547520, balance: 547520, tone: 'g', ageing: 'Current' },
  { invoice: 'INV-8790', date: '30 Jun 26', due: '30 Jul 26', original: 412764, balance: 412764, tone: 'g', ageing: 'Current' },
  { invoice: 'INV-8688', date: '28 May 26', due: '27 Jun 26', original: 326500, balance: 163200, tone: 'a', ageing: '16 days' },
  { invoice: 'INV-8611', date: '12 May 26', due: '22 Jun 26', original: 147000, balance: 147000, tone: 'r', ageing: '21 days' },
]

export const advanceList = [{ ref: 'ORCT-29981', note: 'On account · UPI', date: '18 Jun 26', amount: 120000, status: 'Unadjusted' }]

export const openingBalance = { date: '2026-04-01', amount: 982340 }

// ISO dates so the ledger can be filtered by range; running balance is computed.
export const ledger: { date: string; doc: string; particulars: string; debit?: number; credit?: number }[] = [
  { date: '2026-05-12', doc: 'INV-8611', particulars: 'A/R Invoice · SO-23987', debit: 147000 },
  { date: '2026-05-28', doc: 'INV-8688', particulars: 'A/R Invoice · SO-24012', debit: 326500 },
  { date: '2026-06-05', doc: 'ORCT-29940', particulars: 'Incoming payment · INV-8688 (part)', credit: 163300 },
  { date: '2026-06-18', doc: 'ORCT-29981', particulars: 'Advance on account · UPI', credit: 120000 },
  { date: '2026-06-26', doc: 'ORCT-30078', particulars: 'Incoming payment · PI-1149', credit: 412764 },
  { date: '2026-06-30', doc: 'INV-8790', particulars: 'A/R Invoice · SO-24051', debit: 412764 },
  { date: '2026-07-05', doc: 'ORCT-30112', particulars: 'Incoming payment · PI-1164', credit: 547520 },
  { date: '2026-07-12', doc: 'INV-8842', particulars: 'A/R Invoice · SO-24089', debit: 547520 },
]
