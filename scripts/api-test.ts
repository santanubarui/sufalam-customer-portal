/*
 * API integration test — runs the portal's real src/api code against SAP Service Layer through the Vite dev proxy.
 *   npm run dev             (in another terminal)
 *   npm run test:api        read-only + error-handling tests
 *   npm run test:api:write  also creates/deletes a test PO draft, uploads a test PDF, stamps + restores a delivery
 * Credentials come from .env.development.local (VITE_DEV_SAP_USER / VITE_DEV_SAP_PASSWORD / VITE_DEV_CARD_CODE).
 */
import * as sap from '../src/api/sap'
import * as portal from '../src/api/portal'

const ORIGIN = process.env.PORTAL_ORIGIN || 'http://localhost:5173'
const CRED = { CompanyDB: process.env.VITE_SAP_COMPANY_DB ?? '', UserName: process.env.VITE_DEV_SAP_USER ?? '', Password: process.env.VITE_DEV_SAP_PASSWORD ?? '' }
const CARD = process.env.VITE_DEV_CARD_CODE || '20108'
const WRITE = process.argv.includes('--write')

/* ---- browser-like fetch: absolute URL + cookie jar ---- */
const jar = new Map<string, string>()
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: string, init: RequestInit = {}) => {
  const url = input.startsWith('/') ? ORIGIN + input : input
  const headers = new Headers(init.headers)
  if (jar.size) headers.set('Cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '))
  const res = await realFetch(url, { ...init, headers })
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(';')
    const i = kv.indexOf('=')
    jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim())
  }
  return res
}) as typeof fetch

let expired = 0
sap.onSessionExpired(() => expired++)

type Row = { id: string; area: string; test: string; endpoint: string; expect: string; result: 'PASS' | 'FAIL' | 'SKIP'; ms: number; detail: string }
const rows: Row[] = []
let n = 0

async function t(area: string, test: string, endpoint: string, expect: string, fn: () => Promise<string>) {
  const id = `T${String(++n).padStart(2, '0')}`
  const t0 = performance.now()
  try {
    const detail = await fn()
    rows.push({ id, area, test, endpoint, expect, result: 'PASS', ms: Math.round(performance.now() - t0), detail })
  } catch (e) {
    rows.push({ id, area, test, endpoint, expect, result: 'FAIL', ms: Math.round(performance.now() - t0), detail: sap.errorMessage(e) })
  }
}
const mustFail = async (p: Promise<unknown>, check: (e: sap.SapError) => boolean) => {
  try {
    await p
  } catch (e) {
    if (e instanceof sap.SapError && check(e)) return `HTTP ${e.status} → "${e.message}"`
    throw new Error(`Unexpected error: ${sap.errorMessage(e)}`)
  }
  throw new Error('Expected an error but the call succeeded')
}
const assert = (c: unknown, m: string) => {
  if (!c) throw new Error(m)
}

async function main() {
  /* ---------- authentication ---------- */
  await t('Auth', 'Login with wrong password is rejected', 'POST Login', 'Error, friendly message', () =>
    mustFail(sap.sapLogin({ ...CRED, Password: 'wrong-password' }), (e) => e.status === 401 && /Sign-in failed/.test(e.message)),
  )
  await t('Auth', 'Login with wrong company DB is rejected', 'POST Login', 'Error, friendly message', () =>
    mustFail(sap.sapLogin({ ...CRED, CompanyDB: 'NO_SUCH_DB' }), (e) => e.status >= 400),
  )
  await t('Auth', 'Data call without a session', 'GET Orders', '401 + session-expired hook', async () => {
    const before = expired
    const r = await mustFail(sap.sapRequest('Orders?$top=1'), (e) => e.status === 401)
    assert(expired === before + 1, 'session-expired handler was not called')
    return `${r}; sign-out hook fired`
  })
  await t('Auth', 'Login with valid credentials', 'POST Login', '200, B1SESSION cookie', async () => {
    const r = await sap.sapLogin(CRED)
    assert(jar.has('B1SESSION'), 'no B1SESSION cookie received through proxy')
    return `SL version ${r.Version}, timeout ${r.SessionTimeout} min, cookies: ${[...jar.keys()].join(', ')}`
  })
  await t('Auth', 'Unknown customer code', 'GET BusinessPartners(code)', '404, "not found" message', () =>
    mustFail(portal.getCustomer('NO_SUCH_CUST'), (e) => e.status === 404 && /not found/.test(e.message)),
  )

  /* ---------- reads ---------- */
  let customer!: portal.Customer
  await t('Customer', 'Load customer record', 'GET BusinessPartners(20108)', 'name, balance, credit, addresses', async () => {
    customer = await portal.getCustomer(CARD)
    return `${customer.name}; balance ${customer.balance}; limit ${customer.creditLimit}; available ${customer.available}; price list ${customer.priceList}; ship-to ${customer.shipTo.length}`
  })
  await t('Orders', 'List orders + approval drafts', 'GET Orders, GET Drafts', 'mapped list', async () => {
    const o = await portal.getOrders(CARD)
    const by = o.reduce<Record<string, number>>((m, x) => ((m[x.status] = (m[x.status] ?? 0) + 1), m), {})
    return `${o.length} rows ${JSON.stringify(by)}`
  })
  let items: portal.SalesItem[] = []
  await t('Create PO', 'Load sellable items with price list', 'GET Items', 'items with rates', async () => {
    items = await portal.getSalesItems(customer.priceList)
    const priced = items.filter((i) => i.rate > 0).length
    assert(items.length > 0, 'no items')
    return `${items.length} items, ${priced} with a price on list ${customer.priceList}`
  })
  await t('Payments', 'Pending proforma invoices', 'GET DownPayments (dptRequest)', 'list', async () => `${(await portal.getPendingProformas(CARD)).length} open PIs`)
  await t('Payments', 'Payment history', 'GET IncomingPayments', 'list', async () => {
    const p = await portal.getPayments(CARD)
    return `${p.length} receipts, ${p.filter((x) => x.onAccount).length} on account`
  })
  await t('Statements', 'Open invoices + ageing', 'GET Invoices', 'list', async () => {
    const i = await portal.getOpenInvoices(CARD)
    return `${i.length} open, ${i.filter((x) => x.daysOverdue > 0).length} overdue`
  })
  await t('Statements', 'Ledger (FY 2025-26 → today)', 'GET Invoices/DownPayments/CreditNotes/IncomingPayments', 'rows + reconciling balance', async () => {
    const l = await portal.getLedger(CARD, customer.balance, '2025-04-01', portal.todayIso())
    assert(Math.abs(l.closing - customer.balance) < 0.01, `closing ${l.closing} ≠ SAP balance ${customer.balance}`)
    return `${l.rows.length} rows; opening ${l.opening}; closing ${l.closing} = SAP balance ✓`
  })
  let deliveries!: Awaited<ReturnType<typeof portal.getDeliveries>>
  await t('In-Transit', 'Open & acknowledged deliveries', 'GET DeliveryNotes', 'lists', async () => {
    deliveries = await portal.getDeliveries(CARD)
    return `${deliveries.inTransit.length} in transit, ${deliveries.acknowledged.length} acknowledged`
  })
  await t('Errors', 'Invalid query surfaces SAP message', 'GET Orders?$filter=Bad', '400 with SAP text', () =>
    mustFail(sap.sapRequest("Orders?$filter=NoSuchField eq 'x'"), (e) => e.status === 400 && e.message.length > 0),
  )
  await t('Errors', 'Server unreachable', '(bad host)', 'friendly network message', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch
    try {
      return await mustFail(sap.sapRequest('Orders'), (e) => e.status === 0 && /Cannot reach/.test(e.message))
    } finally {
      globalThis.fetch = saved
    }
  })

  /* ---------- writes (test DB, cleaned up) ---------- */
  if (!WRITE) {
    ;['Create PO draft', 'Upload PO attachment', 'Acknowledge delivery'].forEach((x) =>
      rows.push({ id: `T${String(++n).padStart(2, '0')}`, area: 'Write', test: x, endpoint: '', expect: '', result: 'SKIP', ms: 0, detail: 'run with --write' }),
    )
  } else {
    let att: number | undefined
    await t('Create PO', 'Upload PO PDF attachment', 'POST Attachments2 (multipart)', 'AbsoluteEntry', async () => {
      const pdf = new File(['%PDF-1.4\n% portal API test\n%%EOF\n'], `portal-api-test-${Date.now()}.pdf`, { type: 'application/pdf' })
      att = await portal.uploadAttachment([pdf])
      return `Attachments2 entry ${att}`
    })
    let draft: { DocEntry: number; DocNum: number } | undefined
    const item = items.find((i) => i.rate > 0) ?? items[0]
    const po = (poDate: string, itemCode = item.code) => ({
      cardCode: CARD,
      branch: customer.branch,
      poNumber: `API-TEST-${Date.now()}`,
      poDate,
      deliveryTerms: 'FOR Destination',
      freight: "To Sufalam's account",
      shipTo: customer.shipTo[0]?.code ?? '',
      remarks: 'Automated portal API test — safe to delete',
      lines: [{ itemCode, quantity: 1, expectedDate: poDate }],
      attachmentEntry: att,
    })
    await t('Create PO', 'Submit PO dated today (no SAP series open)', 'POST Drafts (oOrders)', 'clear series message', () =>
      mustFail(portal.createPurchaseOrderDraft(po(portal.todayIso())), (e) => /numbering series open for/.test(e.message)),
    )
    const SERIES_DATE = '2026-09-28' // last dates for which the test DB has open SO series
    await t('Create PO', `Submit PO as SO draft (dated ${SERIES_DATE})`, 'POST Drafts (oOrders)', '201, DocEntry', async () => {
      draft = await portal.createPurchaseOrderDraft(po(SERIES_DATE))
      return `draft DocEntry ${draft.DocEntry} / DocNum ${draft.DocNum}; branch ${customer.branch}; item ${item.code}; attachment ${att}`
    })
    await t('Create PO', 'New draft appears in My Orders', 'GET Drafts', '"Awaiting approval" row', async () => {
      const o = await portal.getOrders(CARD)
      const row = o.find((x) => x.status === 'Awaiting approval' && x.docEntry === draft?.DocEntry)
      assert(row, 'draft not listed')
      return `${row!.po} · ${row!.item} · terms "${row!.terms}" · expected ${row!.expected} · attachment ${row!.hasAttachment}`
    })
    await t('Create PO', 'Invalid PO (unknown item) is rejected', 'POST Drafts', 'clear error message', () =>
      mustFail(portal.createPurchaseOrderDraft(po(SERIES_DATE, 'NO_SUCH_ITEM')), (e) => /no longer exists in SAP/.test(e.message)),
    )
    if (draft) {
      await t('Cleanup', 'Delete test draft', `DELETE Drafts(${draft.DocEntry})`, '204', async () => {
        await sap.sapRequest(`Drafts(${draft!.DocEntry})`, { method: 'DELETE' })
        return 'deleted'
      })
    }

    // acknowledgement: use an open delivery of this customer, or any open one in the test DB; restore afterwards
    let dl = deliveries?.inTransit[0]
    if (!dl) {
      const any = await sap.sapRequest<{ value: { CardCode: string }[] }>("DeliveryNotes?$select=CardCode&$filter=DocumentStatus eq 'bost_Open' and Cancelled eq 'tNO'&$top=1")
      if (any.value[0]) dl = (await portal.getDeliveries(any.value[0].CardCode)).inTransit[0]
    }
    if (dl) {
      const original = dl.comments
      await t('In-Transit', 'Acknowledge delivery', `PATCH DeliveryNotes(${dl.docEntry})`, '204, ACK stamped', async () => {
        await portal.acknowledgeDelivery(dl!, { receivedOn: portal.todayIso(), condition: 'Received in full — OK', remarks: 'API test' })
        const back = await sap.sapRequest<{ Comments: string }>(`DeliveryNotes(${dl!.docEntry})?$select=Comments`)
        assert(back.Comments.startsWith('[Portal ACK'), 'stamp missing')
        return `${dl!.dn}: "${back.Comments.slice(0, 70)}…"`
      })
      await t('Cleanup', 'Restore delivery comments', `PATCH DeliveryNotes(${dl.docEntry})`, '204', async () => {
        await sap.sapRequest(`DeliveryNotes(${dl!.docEntry})`, { method: 'PATCH', body: { Comments: original } })
        return 'original comments restored'
      })
    } else {
      rows.push({ id: `T${String(++n).padStart(2, '0')}`, area: 'In-Transit', test: 'Acknowledge delivery', endpoint: 'PATCH DeliveryNotes', expect: '', result: 'SKIP', ms: 0, detail: 'no open delivery in test DB' })
    }
  }

  await t('Auth', 'Logout', 'POST Logout', '204', async () => {
    await sap.sapLogout()
    await mustFail(sap.sapRequest('Orders?$top=1'), (e) => e.status === 401)
    return 'session closed; follow-up call correctly returns 401'
  })

  for (const r of rows) {
    console.log(`${r.id}  ${r.result.padEnd(4)} ${String(r.ms).padStart(5)}ms  ${r.area.padEnd(10)} ${r.test}\n      → ${r.detail}`)
  }
  const count = (k: Row['result']) => rows.filter((r) => r.result === k).length
  console.log(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped`)
  if (process.env.API_TEST_JSON) (await import('node:fs')).writeFileSync(process.env.API_TEST_JSON, JSON.stringify(rows, null, 1))
  if (count('FAIL')) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
