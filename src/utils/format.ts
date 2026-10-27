const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/** 584000 -> "₹ 5,84,000" */
export const rupees = (n: number) => `₹ ${inr.format(n)}`

/** 584000 -> "5,84,000" */
export const amount = (n: number) => inr.format(n)

/** "2026-07-12" -> "12 Jul 26" */
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
