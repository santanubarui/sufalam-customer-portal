/*
 * API integration test — starts the real portal backend (server/app.ts) in-process and calls /api over HTTP,
 * the same way the browser does. The backend talks to the real SAP Service Layer.
 *   npm run test:api        auth, security, read APIs, error handling (no SAP writes)
 *   npm run test:api:write  also creates/deletes a PO draft, stamps + restores a delivery, creates/deletes a registration lead
 * Settings come from .env + .env.development(.local). Accounts are created in a temporary data folder and
 * no email is sent (OTP codes are read from the dev outbox), so SMTP must NOT be configured for tests.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type * as portal from '../src/api/portal'
import { sapRequest } from '../src/api/sap'
import { createApp } from '../server/app'
import { readConfig } from '../server/config'
import { loadEnvFiles } from '../server/env'

const env = loadEnvFiles('development')
const CARD = env.VITE_DEV_CARD_CODE || env.TEST_CARD_CODE || '20108'
const WRITE = process.argv.includes('--write')
const SERIES_DATE = '2026-09-28' // last date with open SO numbering series in TEST_280726 (see PENDING_ISSUES P-01)
const TEST_EMAIL = 'api-test@portal.test'
const PASSWORD = 'Portal-test-2026'

const dataDir = mkdtempSync(join(tmpdir(), 'sufalam-portal-test-'))
const cfg = { ...readConfig(env, false), dataDir, cookieSecure: false, smtp: null }
const app = createApp(cfg)
const server = createServer((req, res) => {
  void app.handle(req, res).then((h) => h || res.writeHead(404).end())
})

/* ---------- browser-like client with a cookie jar ---------- */
let base = ''
type Jar = Map<string, string>
const newJar = (): Jar => new Map()
let jar = newJar()

interface Res<T = unknown> {
  status: number
  body: T & { error?: { message: string } }
}

async function call<T = unknown>(method: string, path: string, body?: unknown, opts: { csrf?: boolean } = {}): Promise<Res<T>> {
  const headers: Record<string, string> = {}
  if (method !== 'GET' && opts.csrf !== false) headers['x-requested-with'] = 'sufalam-portal'
  if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(base + path, { method, headers, body: payload })
  for (const c of res.headers.getSetCookie()) {
    const [kv] = c.split(';')
    const i = kv.indexOf('=')
    const [k, v] = [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]
    if (/Max-Age=0/i.test(c) || !v) jar.delete(k)
    else jar.set(k, v)
  }
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

const formOf = (fields: Record<string, unknown>, files: Record<string, File[]>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.append(k, JSON.stringify(v))
  for (const [k, list] of Object.entries(files)) list.forEach((x) => f.append(k, x, x.name))
  return f
}
const pdf = (name: string) => new File([`%PDF-1.4\n% portal API test ${name}\n%%EOF\n`], name, { type: 'application/pdf' })
const lastCode = (to: string) => {
  const m = [...app.mailer.outbox].reverse().find((x) => x.to === to)?.text.match(/\b(\d{6})\b/)
  return m?.[1]
}

/* ---------- test harness ---------- */
type Row = { id: string; area: string; test: string; endpoint: string; result: 'PASS' | 'FAIL' | 'SKIP'; ms: number; detail: string }
const rows: Row[] = []
let n = 0

async function t(area: string, test: string, endpoint: string, fn: () => Promise<string>) {
  const id = `T${String(++n).padStart(2, '0')}`
  const t0 = performance.now()
  try {
    const detail = await fn()
    rows.push({ id, area, test, endpoint, result: 'PASS', ms: Math.round(performance.now() - t0), detail })
  } catch (e) {
    rows.push({ id, area, test, endpoint, result: 'FAIL', ms: Math.round(performance.now() - t0), detail: (e as Error).message })
  }
}
const skip = (area: string, test: string, detail: string) =>
  rows.push({ id: `T${String(++n).padStart(2, '0')}`, area, test, endpoint: '', result: 'SKIP', ms: 0, detail })
const assert = (c: unknown, m: string) => {
  if (!c) throw new Error(m)
}
const expect = <T>(r: Res<T>, status: number, what = '') => {
  if (r.status !== status) throw new Error(`expected HTTP ${status}${what ? ` (${what})` : ''}, got ${r.status}: ${r.body?.error?.message ?? JSON.stringify(r.body).slice(0, 160)}`)
  return r.body
}
const errText = (r: Res) => `HTTP ${r.status} → "${r.body?.error?.message}"`

async function main() {
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  console.log(`Portal API on ${base} → SAP ${cfg.companyDB}; test customer ${CARD}; temp data ${dataDir}\n`)

  /* ---------- security ---------- */
  await t('Security', 'Data call without a session is refused', 'GET /api/customer', async () => errText(await call('GET', '/api/customer').then((r) => (expect(r, 401), r))))
  await t('Security', 'POST without the portal CSRF header is blocked', 'POST /api/auth/login', async () =>
    errText(await call('POST', '/api/auth/login', { email: TEST_EMAIL, password: 'x' }, { csrf: false }).then((r) => (expect(r, 403), r))),
  )
  await t('Auth', 'Unknown email cannot sign in', 'POST /api/auth/login', async () =>
    errText(await call('POST', '/api/auth/login', { email: 'nobody@portal.test', password: 'whatever1' }).then((r) => (expect(r, 401), r))),
  )
  await t('Auth', 'Forgot password for an unknown email reveals nothing', 'POST /api/auth/password/forgot', async () => {
    const before = app.mailer.outbox.length
    const r = await call<{ message: string }>('POST', '/api/auth/password/forgot', { email: 'nobody@portal.test' })
    expect(r, 200)
    assert(app.mailer.outbox.length === before, 'an email was sent for an unknown address')
    return `200 "${r.body.message.slice(0, 60)}…", no email sent`
  })

  /* ---------- account set-up via OTP ---------- */
  const now = new Date().toISOString()
  await app.users.save({ email: TEST_EMAIL, cardCode: CARD, name: CARD, status: 'active', sessionVersion: 0, createdAt: now, updatedAt: now })
  let code = ''
  await t('Auth', 'Request a password code (OTP email)', 'POST /api/auth/password/forgot', async () => {
    expect(await call('POST', '/api/auth/password/forgot', { email: TEST_EMAIL }), 200)
    code = lastCode(TEST_EMAIL) ?? ''
    assert(/^\d{6}$/.test(code), 'no 6-digit code in the email')
    return `code emailed to ${TEST_EMAIL}`
  })
  await t('Auth', 'Second code within a minute is throttled', 'POST /api/auth/password/forgot', async () =>
    errText(await call('POST', '/api/auth/password/forgot', { email: TEST_EMAIL }).then((r) => (expect(r, 429), r))),
  )
  await t('Auth', 'Weak password is rejected', 'POST /api/auth/password/reset', async () =>
    errText(await call('POST', '/api/auth/password/reset', { email: TEST_EMAIL, code, password: 'short' }).then((r) => (expect(r, 400), r))),
  )
  await t('Auth', 'Wrong code is rejected', 'POST /api/auth/password/reset', async () => {
    const wrong = code === '000000' ? '111111' : '000000'
    return errText(await call('POST', '/api/auth/password/reset', { email: TEST_EMAIL, code: wrong, password: PASSWORD }).then((r) => (expect(r, 400), r)))
  })
  await t('Auth', 'Correct code sets the password', 'POST /api/auth/password/reset', async () => {
    const r = await call<{ message: string }>('POST', '/api/auth/password/reset', { email: TEST_EMAIL, code, password: PASSWORD })
    expect(r, 200)
    return r.body.message
  })
  await t('Auth', 'Used code cannot be reused', 'POST /api/auth/password/reset', async () =>
    errText(await call('POST', '/api/auth/password/reset', { email: TEST_EMAIL, code, password: PASSWORD }).then((r) => (expect(r, 400), r))),
  )
  await t('Auth', 'Wrong password is rejected', 'POST /api/auth/login', async () =>
    errText(await call('POST', '/api/auth/login', { email: TEST_EMAIL, password: 'Wrong-pass-1' }).then((r) => (expect(r, 401), r))),
  )

  let customer!: portal.Customer
  await t('Auth', 'Sign in with email + password', 'POST /api/auth/login', async () => {
    const r = await call<{ customer: portal.Customer }>('POST', '/api/auth/login', { email: TEST_EMAIL, password: PASSWORD })
    customer = expect(r, 200).customer
    assert(jar.has('sufalam_session'), 'no session cookie')
    return `${customer.name} (${customer.code}); HttpOnly session cookie set`
  })
  await t('Auth', 'Session survives a reload', 'GET /api/auth/me', async () => {
    const r = await call<{ user: { cardCode: string } }>('GET', '/api/auth/me')
    assert(expect(r, 200).user.cardCode === CARD, 'wrong customer')
    return `signed in as customer ${r.body.user.cardCode}`
  })

  /* ---------- reads ---------- */
  await t('Customer', 'Load customer record', 'GET /api/customer', async () => {
    const c = expect(await call<portal.Customer>('GET', '/api/customer'), 200)
    return `${c.name}; balance ${c.balance}; limit ${c.creditLimit}; available ${c.available}; price list ${c.priceList}; branch ${c.branch}; ship-to ${c.shipTo.length}`
  })
  await t('Orders', 'List orders + approval drafts', 'GET /api/orders', async () => {
    const o = expect(await call<portal.Order[]>('GET', '/api/orders'), 200)
    const by = o.reduce<Record<string, number>>((m, x) => ((m[x.status] = (m[x.status] ?? 0) + 1), m), {})
    return `${o.length} rows ${JSON.stringify(by)}`
  })
  let items: portal.SalesItem[] = []
  await t('Create PO', 'Sellable items with the customer price list', 'GET /api/items', async () => {
    items = expect(await call<portal.SalesItem[]>('GET', '/api/items'), 200)
    assert(items.length > 0, 'no items')
    return `${items.length} items, ${items.filter((i) => i.rate > 0).length} with a price`
  })
  await t('Payments', 'Pending proforma invoices', 'GET /api/proformas', async () => `${expect(await call<unknown[]>('GET', '/api/proformas'), 200).length} open PIs`)
  await t('Payments', 'Payment history', 'GET /api/payments', async () => {
    const p = expect(await call<portal.Payment[]>('GET', '/api/payments'), 200)
    return `${p.length} receipts, ${p.filter((x) => x.onAccount).length} on account`
  })
  await t('Statements', 'Open invoices + ageing', 'GET /api/invoices/open', async () => {
    const i = expect(await call<portal.OpenInvoice[]>('GET', '/api/invoices/open'), 200)
    return `${i.length} open, ${i.filter((x) => x.daysOverdue > 0).length} overdue`
  })
  await t('Statements', 'Ledger reconciles to the SAP balance', 'GET /api/ledger', async () => {
    const l = expect(await call<{ opening: number; closing: number; rows: unknown[] }>('GET', `/api/ledger?from=2025-04-01&to=${new Date().toISOString().slice(0, 10)}`), 200)
    assert(Math.abs(l.closing - customer.balance) < 0.01, `closing ${l.closing} ≠ SAP balance ${customer.balance}`)
    return `${l.rows.length} rows; opening ${l.opening}; closing ${l.closing} = SAP balance ✓`
  })
  await t('Statements', 'Invalid ledger dates are rejected', 'GET /api/ledger', async () => errText(await call('GET', '/api/ledger?from=yesterday&to=2026-01-01').then((r) => (expect(r, 400), r))))
  let deliveries!: { inTransit: portal.Delivery[]; acknowledged: portal.Delivery[] }
  await t('In-Transit', 'Open & acknowledged deliveries', 'GET /api/deliveries', async () => {
    deliveries = expect(await call<typeof deliveries>('GET', '/api/deliveries'), 200)
    return `${deliveries.inTransit.length} in transit, ${deliveries.acknowledged.length} acknowledged`
  })

  // a delivery belonging to another customer — used for the scoping test and the write test
  const other = await sapRequest<{ value: { DocEntry: number; CardCode: string }[] }>(
    `DeliveryNotes?$select=DocEntry,CardCode&$filter=DocumentStatus eq 'bost_Open' and Cancelled eq 'tNO' and CardCode ne '${CARD}'&$top=1`,
  ).then((r) => r.value[0])
  if (other) {
    await t('Security', "Cannot acknowledge another customer's delivery", `POST /api/deliveries/${other.DocEntry}/ack`, async () => {
      const r = await call('POST', `/api/deliveries/${other.DocEntry}/ack`, formOf({ ack: { receivedOn: SERIES_DATE, condition: 'Received in full — OK', remarks: '' } }, {}))
      return errText((expect(r, 404), r))
    })
  } else skip('Security', "Cannot acknowledge another customer's delivery", 'no delivery of another customer in the DB')

  /* ---------- writes ---------- */
  if (!WRITE) {
    ;['Create PO draft', 'Acknowledge delivery', 'New customer registration'].forEach((x) => skip('Write', x, 'run with --write'))
  } else {
    const item = items.find((i) => i.rate > 0) ?? items[0]
    const po = (poDate: string, extra: Record<string, unknown> = {}) => ({
      poNumber: `API-TEST-${Date.now()}`,
      poDate,
      deliveryTerms: 'FOR Destination',
      freight: "To Sufalam's account",
      shipTo: customer.shipTo[0]?.code ?? '',
      remarks: 'Automated portal API test — safe to delete',
      lines: [{ itemCode: item.code, quantity: 1, expectedDate: poDate }],
      ...extra,
    })
    await t('Create PO', 'Ship-to of another customer is rejected', 'POST /api/orders', async () =>
      errText(await call('POST', '/api/orders', formOf({ po: po(SERIES_DATE, { shipTo: 'NOT-MY-ADDRESS' }) }, {})).then((r) => (expect(r, 400), r))),
    )
    await t('Create PO', 'Non-PDF PO copy is rejected', 'POST /api/orders', async () =>
      errText(await call('POST', '/api/orders', formOf({ po: po(SERIES_DATE) }, { file: [new File(['hello'], 'po.pdf')] })).then((r) => (expect(r, 400), r))),
    )
    await t('Create PO', 'PO dated today (no SAP series open)', 'POST /api/orders', async () => {
      const r = await call('POST', '/api/orders', formOf({ po: po(new Date().toISOString().slice(0, 10)) }, {}))
      if (r.status === 201) return 'accepted — SAP numbering series for today now exist (P-01 fixed)'
      assert(/numbering series open for/.test(r.body?.error?.message ?? ''), `unexpected: ${errText(r)}`)
      return errText(r)
    })
    let draft: { docEntry: number; docNum: number; attachWarning: string } | undefined
    await t('Create PO', `Submit PO with PDF (dated ${SERIES_DATE})`, 'POST /api/orders', async () => {
      draft = expect(await call<NonNullable<typeof draft>>('POST', '/api/orders', formOf({ po: po(SERIES_DATE) }, { file: [pdf('po.pdf')] })), 201)
      assert(!draft.attachWarning, `attachment failed: ${draft.attachWarning}`)
      return `draft DocEntry ${draft.docEntry} / DocNum ${draft.docNum}; branch ${customer.branch}; PDF attached`
    })
    await t('Create PO', 'New PO appears in My Orders', 'GET /api/orders', async () => {
      const row = expect(await call<portal.Order[]>('GET', '/api/orders'), 200).find((x) => x.docEntry === draft?.docEntry && x.status === 'Awaiting approval')
      assert(row, 'draft not listed')
      return `${row!.po} · ${row!.item} · terms "${row!.terms}" · attachment ${row!.hasAttachment}`
    })
    await t('Create PO', 'Unknown item is rejected', 'POST /api/orders', async () =>
      errText(await call('POST', '/api/orders', formOf({ po: { ...po(SERIES_DATE), lines: [{ itemCode: 'NO_SUCH_ITEM', quantity: 1, expectedDate: SERIES_DATE }] } }, {})).then((r) => (assert(r.status >= 400 && /no longer exists/.test(r.body?.error?.message ?? ''), errText(r)), r))),
    )
    if (draft) {
      await t('Cleanup', 'Delete test draft', `DELETE Drafts(${draft.docEntry})`, async () => {
        await sapRequest(`Drafts(${draft!.docEntry})`, { method: 'DELETE' })
        return 'deleted'
      })
    }

    // acknowledgement: own delivery, or sign in as the owner of another open delivery; restore afterwards
    let dl = deliveries.inTransit[0]
    let owner = CARD
    if (!dl && other) {
      owner = other.CardCode
      const email = 'api-test-2@portal.test'
      await app.users.save({ email, cardCode: owner, name: owner, status: 'active', sessionVersion: 0, createdAt: now, updatedAt: now })
      await call('POST', '/api/auth/password/forgot', { email })
      await call('POST', '/api/auth/password/reset', { email, code: lastCode(email), password: PASSWORD })
      jar = newJar()
      expect(await call('POST', '/api/auth/login', { email, password: PASSWORD }), 200, 'second test account')
      dl = expect(await call<typeof deliveries>('GET', '/api/deliveries'), 200).inTransit[0]
    }
    if (dl) {
      const original = (await sapRequest<{ Comments: string | null }>(`DeliveryNotes(${dl.docEntry})?$select=Comments`)).Comments
      await t('In-Transit', `Acknowledge delivery (customer ${owner})`, `POST /api/deliveries/${dl.docEntry}/ack`, async () => {
        const r = await call<{ attachWarning: string }>('POST', `/api/deliveries/${dl!.docEntry}/ack`, formOf({ ack: { receivedOn: dl!.date, condition: 'Received in full — OK', remarks: 'API test' } }, {}))
        expect(r, 200)
        const back = await sapRequest<{ Comments: string }>(`DeliveryNotes(${dl!.docEntry})?$select=Comments`)
        assert(back.Comments.startsWith('[Portal ACK'), 'stamp missing')
        return `${dl!.dn}: "${back.Comments.slice(0, 60)}…"`
      })
      await t('In-Transit', 'Second acknowledgement is refused', `POST /api/deliveries/${dl.docEntry}/ack`, async () =>
        errText(await call('POST', `/api/deliveries/${dl!.docEntry}/ack`, formOf({ ack: { receivedOn: dl!.date, condition: 'Received in full — OK', remarks: '' } }, {})).then((r) => (expect(r, 409), r))),
      )
      await t('Cleanup', 'Restore delivery comments', `PATCH DeliveryNotes(${dl.docEntry})`, async () => {
        await sapRequest(`DeliveryNotes(${dl!.docEntry})`, { method: 'PATCH', body: { Comments: original ?? '' } })
        return 'original comments restored'
      })
    } else skip('In-Transit', 'Acknowledge delivery', 'no open delivery in the test DB')

    /* registration → SAP lead */
    jar = newJar()
    const regEmail = `api-test-${Date.now()}@portal.test`
    const reg = {
      companyName: 'PORTAL API TEST PVT LTD (DELETE ME)',
      constitution: 'Private Limited',
      gstin: '19ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      cin: 'U24100WB2015PTC123456',
      address: '1 Test Street, Test Area',
      city: 'Kolkata',
      pinCode: '700001',
      contactPerson: 'API Tester',
      mobile: '9876543210',
      email: regEmail,
      bankAccount: '123456789012',
      ifsc: 'SBIN0000001',
      bankBranch: 'SBI Test Branch',
    }
    const kyc = { gst: [pdf('gst.pdf')], pan: [pdf('pan.pdf')], cheque: [pdf('cheque.pdf')], cin: [pdf('cin.pdf')] }
    await t('Register', 'Invalid GSTIN is rejected', 'POST /api/register', async () =>
      errText(await call('POST', '/api/register', formOf({ data: { ...reg, gstin: '19ABCDE1234F' } }, kyc)).then((r) => (expect(r, 400), r))),
    )
    await t('Register', 'Missing KYC document is rejected', 'POST /api/register', async () =>
      errText(await call('POST', '/api/register', formOf({ data: reg }, { ...kyc, cheque: [] })).then((r) => (expect(r, 400), r))),
    )
    let lead = ''
    await t('Register', 'Registration creates a SAP lead with KYC files', 'POST /api/register', async () => {
      lead = expect(await call<{ reference: string }>('POST', '/api/register', formOf({ data: reg }, kyc)), 201).reference
      const bp = await sapRequest<{ CardType: string; AttachmentEntry: number | null; BPAddresses: { State: string; GSTIN: string }[] }>(
        `BusinessPartners('${lead}')?$select=CardType,AttachmentEntry,BPAddresses`,
      )
      assert(bp.CardType === 'cLid', `card type ${bp.CardType}`)
      assert(bp.AttachmentEntry, 'no KYC attachment')
      return `lead ${lead}; state ${bp.BPAddresses[0]?.State}; GSTIN ${bp.BPAddresses[0]?.GSTIN}; attachment ${bp.AttachmentEntry}`
    })
    await t('Register', 'Same email cannot register twice', 'POST /api/register', async () =>
      errText(await call('POST', '/api/register', formOf({ data: reg }, kyc)).then((r) => (expect(r, 409), r))),
    )
    await t('Register', 'Pending applicant gets "under review", no code', 'POST /api/auth/password/forgot', async () => {
      expect(await call('POST', '/api/auth/password/forgot', { email: regEmail }), 200)
      const last = [...app.mailer.outbox].reverse().find((m) => m.to === regEmail)
      assert(last && /still being reviewed/.test(last.text) && !/\b\d{6}\b/.test(last.text.replace(lead, '')), 'expected the review notice')
      return 'review notice emailed'
    })
    if (lead) {
      await t('Cleanup', 'Delete test lead', `DELETE BusinessPartners('${lead}')`, async () => {
        await sapRequest(`BusinessPartners('${lead}')`, { method: 'DELETE' })
        return 'deleted (the KYC attachment entry stays in SAP)'
      })
    }
  }

  jar = newJar()
  expect(await call('POST', '/api/auth/login', { email: TEST_EMAIL, password: PASSWORD }), 200)
  await t('Auth', 'Sign out ends the session', 'POST /api/auth/logout', async () => {
    expect(await call('POST', '/api/auth/logout'), 200)
    expect(await call('GET', '/api/customer'), 401, 'after logout')
    return 'cookie cleared; next call returns 401'
  })

  for (const r of rows) console.log(`${r.id}  ${r.result.padEnd(4)} ${String(r.ms).padStart(5)}ms  ${r.area.padEnd(10)} ${r.test}\n      → ${r.detail}`)
  const count = (k: Row['result']) => rows.filter((r) => r.result === k).length
  console.log(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped`)
  if (process.env.API_TEST_JSON) (await import('node:fs')).writeFileSync(process.env.API_TEST_JSON, JSON.stringify(rows, null, 1))
  if (count('FAIL')) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    server.close()
    await app.close()
    rmSync(dataDir, { recursive: true, force: true })
  })
