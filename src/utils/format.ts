const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/** 584000 -> "₹ 5,84,000" */
export const rupees = (n: number) => `₹ ${inr.format(n)}`

/** 584000 -> "5,84,000" */
export const amount = (n: number) => inr.format(n)

const parse = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`)

/** "2026-07-12" -> "12 Jul 26" */
export const shortDate = (iso: string | null | undefined) =>
  iso ? parse(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

/** "2026-07-12" -> "12 Jul 2026" */
export const longDate = (iso: string | null | undefined) =>
  iso ? parse(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

/** "2026-07-12" -> "12 Jul" */
export const dayMonth = (iso: string | null | undefined) =>
  iso ? parse(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'
