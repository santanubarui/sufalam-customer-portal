import { dmy } from '../api/portal'

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/** 584000 -> "₹ 5,84,000" */
export const rupees = (n: number) => `₹ ${inr.format(n)}`

/** 584000 -> "5,84,000" */
export const amount = (n: number) => inr.format(n)

/** "2026-07-12" -> "12-07-2026"; "—" when there's no date. Every date in the portal is shown as dd-mm-yyyy. */
export const fmtDate = (iso: string | null | undefined) => dmy(iso) || '—'
