/*
 * Portal backend API (mounted at /api).
 *
 *   Auth      POST /api/auth/login · POST /api/auth/logout · GET /api/auth/me
 *             POST /api/auth/password/forgot · POST /api/auth/password/reset
 *   Register  POST /api/register (multipart: data + KYC files) → SAP Lead
 *   Data      GET  /api/customer · /api/orders · /api/items · /api/invoices/open · /api/proformas
 *                  /api/payments · /api/deliveries · /api/ledger?from&to
 *             POST /api/orders (multipart: po + file) · POST /api/deliveries/:docEntry/ack (multipart: ack + photo)
 *
 * Every data route uses the CardCode of the signed-in portal account — never a code sent by the browser.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import * as portal from '../src/api/portal'
import { SapError } from '../src/api/sap'
import {
  hashPassword,
  normEmail,
  OTP_MINUTES,
  OtpStore,
  passwordProblem,
  readSession,
  signSession,
  UserStore,
  validEmail,
  verifyPassword,
  type PortalUser,
} from './accounts'
import type { ServerConfig } from './config'
import { bad, clientIp, cookie, formFiles, formJson, HttpError, parseCookies, RateLimiter, readForm, readJson, sendJson } from './http'
import { createMailer, type Mail } from './mail'
import { approvedCustomer, checkFile, collectKycFiles, createLead, findCustomersByEmail, uniqueStamp, validateRegistration } from './sapAccounts'
import { connectServiceLayer } from './sl'

const SESSION_COOKIE = 'sufalam_session'
const CSRF_HEADER = 'x-requested-with'
const CSRF_VALUE = 'sufalam-portal'
const MB = 1048576

interface Ctx {
  req: IncomingMessage
  res: ServerResponse
  url: URL
  params: string[]
  user: PortalUser | null
  headers: Record<string, string | string[]>
}

type Handler = (ctx: Ctx) => Promise<unknown>
interface Route {
  method: 'GET' | 'POST'
  path: RegExp
  auth: boolean
  handler: Handler
}

const isoDate = (v: unknown, label: string) => {
  const s = String(v ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw bad(`${label} must be a date (yyyy-mm-dd).`)
  return s
}
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
const safeName = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'file'

export function createApp(cfg: ServerConfig) {
  const sl = connectServiceLayer(cfg)
  const users = new UserStore(cfg.dataDir)
  const otp = new OtpStore()
  const mailer = createMailer(cfg)

  const loginLimiter = new RateLimiter(8, 15 * 60_000)
  const ipLimiter = new RateLimiter(60, 15 * 60_000)
  const resendLimiter = new RateLimiter(1, 60_000)
  const otpLimiter = new RateLimiter(5, 60 * 60_000)
  const registerLimiter = new RateLimiter(5, 60 * 60_000)

  /* ---------- customer record cache (price list, branch, ship-to) ---------- */
  const customers = new Map<string, { at: number; c: portal.Customer }>()
  const freshCustomer = async (code: string) => {
    const c = await portal.getCustomer(code)
    customers.set(code, { at: Date.now(), c })
    return c
  }
  const cachedCustomer = async (code: string) => {
    const hit = customers.get(code)
    return hit && Date.now() - hit.at < 60_000 ? hit.c : freshCustomer(code)
  }

  /* ---------- sessions ---------- */
  const setSession = (ctx: Ctx, u: PortalUser) => {
    const token = signSession({ email: u.email, ver: u.sessionVersion, exp: Date.now() + cfg.sessionMinutes * 60_000 }, cfg.sessionSecret)
    ctx.headers['set-cookie'] = cookie(SESSION_COOKIE, token, { maxAge: cfg.sessionMinutes * 60, secure: cfg.cookieSecure })
  }
  const clearSession = (ctx: Ctx) => {
    ctx.headers['set-cookie'] = cookie(SESSION_COOKIE, '', { maxAge: 0, secure: cfg.cookieSecure })
  }
  async function currentUser(req: IncomingMessage) {
    const claims = readSession(parseCookies(req)[SESSION_COOKIE], cfg.sessionSecret)
    if (!claims) return null
    const u = await users.get(claims.email)
    return u && u.status === 'active' && u.sessionVersion === claims.ver ? u : null
  }
  const publicUser = (u: PortalUser) => ({ email: u.email, cardCode: u.cardCode, name: u.name })
  const me = (ctx: Ctx) => ctx.user!

  const mail = async (m: Mail, mustSend = true) => {
    try {
      await mailer.send(m)
    } catch (e) {
      if (mustSend) throw new HttpError(502, (e as Error).message)
    }
  }

  /* =================================================================
   * Routes
   * ===============================================================*/
  const routes: Route[] = []
  const route = (method: Route['method'], path: string, auth: boolean, handler: Handler) =>
    routes.push({ method, path: new RegExp(`^${path.replace(/:\w+/g, '([^/]+)')}$`), auth, handler })

  /* ---------- auth ---------- */

  route('POST', '/api/auth/login', false, async (ctx) => {
    const body = await readJson<{ email?: string; password?: string }>(ctx.req)
    const email = normEmail(body.email ?? '')
    const password = String(body.password ?? '')
    const sapUser = !email.includes('@') && /^[\w.-]{1,50}$/.test(email)
    if ((!validEmail(email) && !sapUser) || !password) throw bad('Enter your email ID (or SAP user ID) and password.')
    ipLimiter.hit(`login:${clientIp(ctx.req, cfg.trustProxy)}`)
    loginLimiter.hit(`login:${email}`, 'Too many failed sign-in attempts. Please wait 15 minutes or reset your password.')

    let u: PortalUser | undefined
    if (sapUser) {
      // SAP user ID (e.g. manager): the password is checked by SAP itself, never stored by the portal.
      if (!cfg.staffCardCode) throw new HttpError(401, 'Incorrect user ID or password.')
      const rawId = String(body.email ?? '').trim()
      if (!(await sl.verifyUser(rawId, password))) throw new HttpError(401, 'Incorrect user ID or password.')
      const now = new Date().toISOString()
      u = (await users.get(email)) ?? { email, cardCode: cfg.staffCardCode, name: rawId, status: 'active', sessionVersion: 1, createdAt: now, updatedAt: now }
      u.cardCode = cfg.staffCardCode
      u.status = 'active'
      delete u.passwordHash
    } else {
      u = await users.get(email)
      const ok = await verifyPassword(password, u?.passwordHash)
      if (!u || !ok || u.status !== 'active') throw new HttpError(401, 'Incorrect email or password.')
    }

    let customer: portal.Customer
    try {
      customer = await freshCustomer(u.cardCode)
    } catch (e) {
      if (e instanceof SapError && (e.status === 404 || e.status === 400)) {
        throw new HttpError(403, 'Your customer account is not active in SAP. Please contact Sufalam.')
      }
      throw e
    }
    loginLimiter.reset(`login:${email}`)
    u.name = customer.name
    u.lastLoginAt = new Date().toISOString()
    await users.save(u)
    setSession(ctx, u)
    return { user: publicUser(u), customer }
  })

  route('POST', '/api/auth/logout', false, async (ctx) => {
    clearSession(ctx)
    return { ok: true }
  })

  route('GET', '/api/auth/me', true, async (ctx) => ({ user: publicUser(me(ctx)) }))

  route('POST', '/api/auth/password/forgot', false, async (ctx) => {
    const body = await readJson<{ email?: string }>(ctx.req)
    const email = normEmail(body.email ?? '')
    if (!validEmail(email)) throw bad('Enter a valid email address.')
    ipLimiter.hit(`otp:${clientIp(ctx.req, cfg.trustProxy)}`)
    resendLimiter.hit(`otp:${email}`, 'Please wait a minute before requesting another code.')
    otpLimiter.hit(`otp:${email}`, 'Too many codes requested for this email. Please try again in an hour.')

    const u = await users.get(email)
    let link: { cardCode: string; name: string } | null = null

    if (u?.status === 'active') {
      link = { cardCode: u.cardCode, name: u.name }
    } else if (u?.status === 'pending') {
      const ok = u.registration ? await approvedCustomer(u.registration.leadCode, email) : null
      if (ok) {
        Object.assign(u, { status: 'active', cardCode: ok.cardCode, name: ok.name })
        await users.save(u)
        link = ok
      } else {
        await mail({
          to: email,
          subject: 'Sufalam portal — registration still under review',
          text: `Your registration${u.registration ? ` (reference ${u.registration.leadCode})` : ''} is still being reviewed by Sufalam.\nYou will receive an email as soon as it is approved.`,
        })
      }
    } else if (!u) {
      // existing Sufalam customers: first sign-in with the email address held on their SAP account
      const found = await findCustomersByEmail(email)
      if (found.length === 1) link = found[0]
      else if (found.length > 1) {
        await mail({
          to: email,
          subject: 'Sufalam portal — please contact Sufalam',
          text: `This email address is linked to ${found.length} customer accounts at Sufalam, so a portal login cannot be created automatically.\nPlease ask your Sufalam sales representative to set up your portal access.`,
        })
      }
    }

    if (link) {
      const code = otp.issue(email, link)
      await mail({
        to: email,
        subject: `Sufalam portal verification code: ${code}`,
        text: `Your verification code is ${code}\n\nUse it to set your password for the Sufalam Customer Portal (${link.name}, customer ${link.cardCode}).\nThe code is valid for ${OTP_MINUTES} minutes. If you did not ask for it, you can ignore this email.`,
      })
    }
    return { message: `If this email is registered with Sufalam, a 6-digit code has been sent to it. The code is valid for ${OTP_MINUTES} minutes.` }
  })

  route('POST', '/api/auth/password/reset', false, async (ctx) => {
    const body = await readJson<{ email?: string; code?: string; password?: string }>(ctx.req)
    const email = normEmail(body.email ?? '')
    ipLimiter.hit(`reset:${clientIp(ctx.req, cfg.trustProxy)}`)
    if (!validEmail(email)) throw bad('Enter a valid email address.')
    if (!/^\d{6}$/.test(String(body.code ?? ''))) throw bad('Enter the 6-digit code sent to your email.')
    const problem = passwordProblem(String(body.password ?? ''))
    if (problem) throw bad(problem)

    const r = otp.consume(email, String(body.code))
    if (r === 'expired') throw bad('This code has expired or was already used. Please request a new code.')
    if (r === 'wrong') throw bad('The code is incorrect. Please check the email and try again.')
    if (r === 'locked') throw bad('Too many incorrect attempts. Please request a new code.')

    const now = new Date().toISOString()
    const u: PortalUser = (await users.get(email)) ?? { email, cardCode: r.cardCode, name: r.name, status: 'active', sessionVersion: 0, createdAt: now, updatedAt: now }
    if (u.status === 'disabled') throw new HttpError(403, 'This portal account is disabled. Please contact Sufalam.')
    Object.assign(u, {
      cardCode: r.cardCode,
      name: r.name,
      status: 'active',
      passwordHash: await hashPassword(String(body.password)),
      sessionVersion: u.sessionVersion + 1,
    })
    await users.save(u)
    loginLimiter.reset(`login:${email}`)
    await mail(
      { to: email, subject: 'Sufalam portal — password changed', text: `The password for your Sufalam Customer Portal account (${u.name}) was just set.\nIf this wasn't you, contact Sufalam immediately.` },
      false,
    )
    return { message: 'Your password has been set. You can now sign in.' }
  })

  /* ---------- new customer registration ---------- */

  route('POST', '/api/register', false, async (ctx) => {
    registerLimiter.hit(`reg:${clientIp(ctx.req, cfg.trustProxy)}`, 'Too many registrations from this network. Please try again later.')
    const form = await readForm(ctx.req, 40 * MB)
    const r = validateRegistration(formJson(form, 'data'))

    if (await users.get(r.email)) {
      throw new HttpError(409, 'This email is already registered on the portal. Use "Forgot password" on the sign-in page if you cannot sign in.')
    }
    if ((await findCustomersByEmail(r.email)).length) {
      throw new HttpError(409, 'This email already belongs to a Sufalam customer account. Use "Forgot password" on the sign-in page to set up your login.')
    }
    const files = await collectKycFiles(form, r.constitution)
    const { leadCode } = await createLead(r, files)

    const now = new Date().toISOString()
    await users.save({
      email: r.email,
      cardCode: leadCode,
      name: r.companyName,
      status: 'pending',
      sessionVersion: 0,
      createdAt: now,
      updatedAt: now,
      registration: { submittedAt: now, leadCode, companyName: r.companyName, gstin: r.gstin, mobile: r.mobile, contactPerson: r.contactPerson },
    })
    console.log(`[register] ${r.companyName} (${r.gstin}) → SAP lead ${leadCode}`)

    await mail(
      {
        to: r.email,
        subject: `Sufalam portal — application received (${leadCode})`,
        text: `Thank you for registering ${r.companyName} with Sufalam Industries.\nYour reference number is ${leadCode}.\n\nYour application is now with Sufalam's approving authority. Once it is approved you will receive an email with a link to set your portal password.`,
      },
      false,
    )
    if (cfg.notifyEmail) {
      await mail(
        {
          to: cfg.notifyEmail,
          subject: `New portal registration: ${r.companyName} (${leadCode})`,
          text: `A new customer registered on the portal and was created in SAP as lead ${leadCode}.\n\nCompany: ${r.companyName} (${r.constitution})\nGSTIN: ${r.gstin} · PAN: ${r.pan}${r.cin ? ` · CIN: ${r.cin}` : ''}\nAddress: ${r.address}, ${r.city} ${r.pinCode}, ${r.stateName}\nContact: ${r.contactPerson}, +91 ${r.mobile}, ${r.email}\nBank: ${r.bankAccount} / ${r.ifsc} / ${r.bankBranch}\nKYC files: ${files.length} (attached to the lead in SAP)\n\nTo approve: review the lead in SAP Business One and convert it to a customer (assign price list and branch). The customer is emailed automatically.`,
        },
        false,
      )
    }
    ctx.res.statusCode = 201
    return { reference: leadCode, message: 'Application submitted.' }
  })

  /* ---------- customer data ---------- */

  route('GET', '/api/customer', true, async (ctx) => freshCustomer(me(ctx).cardCode))
  route('GET', '/api/orders', true, async (ctx) => portal.getOrders(me(ctx).cardCode))
  route('GET', '/api/items', true, async (ctx) => portal.getSalesItems((await cachedCustomer(me(ctx).cardCode)).priceList))
  route('GET', '/api/invoices/open', true, async (ctx) => portal.getOpenInvoices(me(ctx).cardCode))
  route('GET', '/api/proformas', true, async (ctx) => portal.getPendingProformas(me(ctx).cardCode))
  route('GET', '/api/payments', true, async (ctx) => portal.getPayments(me(ctx).cardCode))
  route('GET', '/api/deliveries', true, async (ctx) => portal.getDeliveries(me(ctx).cardCode))

  route('GET', '/api/ledger', true, async (ctx) => {
    const from = isoDate(ctx.url.searchParams.get('from'), 'From date')
    const to = isoDate(ctx.url.searchParams.get('to'), 'To date')
    if (from > to) throw bad('The "from" date must be before the "to" date.')
    const cardCode = me(ctx).cardCode
    const customer = await freshCustomer(cardCode) // ledger reconciles back from today's live balance
    return portal.getLedger(cardCode, customer.balance, from, to)
  })

  route('POST', '/api/orders', true, async (ctx) => {
    const cardCode = me(ctx).cardCode
    const form = await readForm(ctx.req, 8 * MB)
    const po = formJson<Partial<portal.NewPurchaseOrder>>(form, 'po')
    const customer = await cachedCustomer(cardCode)

    const poNumber = text(po.poNumber, 100)
    if (!poNumber) throw bad('Enter your PO number.')
    const poDate = isoDate(po.poDate, 'PO date')
    const shipTo = text(po.shipTo, 50)
    if (customer.shipTo.length && !customer.shipTo.some((s) => s.code === shipTo)) throw bad('Choose one of your ship-to addresses.')
    const lines = Array.isArray(po.lines) ? po.lines : []
    if (!lines.length || lines.length > 100) throw bad('Add between 1 and 100 PO lines.')
    const cleanLines = lines.map((l, i) => {
      const quantity = Number(l?.quantity)
      if (!(quantity > 0 && quantity < 1e9)) throw bad(`Line ${i + 1}: quantity must be greater than zero.`)
      const expectedDate = isoDate(l?.expectedDate, `Line ${i + 1}: expected delivery`)
      if (expectedDate < poDate) throw bad(`Line ${i + 1}: expected delivery can't be before the PO date.`)
      const itemCode = text(l?.itemCode, 50)
      if (!itemCode) throw bad(`Line ${i + 1}: choose an item.`)
      return { itemCode, quantity, expectedDate }
    })

    // every line must be a sellable item with a valid price in the customer's SAP price list — checked before
    // anything (attachment or draft) is written to SAP
    const sellable = new Map((await portal.getSalesItems(customer.priceList)).map((i) => [i.code, i]))
    cleanLines.forEach((l, i) => {
      const it = sellable.get(l.itemCode)
      if (!it) throw bad(`Line ${i + 1}: item ${l.itemCode} no longer exists in SAP or is not sellable. Please refresh the page and try again.`)
      if (it.rate == null) throw bad(`Line ${i + 1} (${it.name}): ${portal.PRICE_UNAVAILABLE}`)
    })

    // PO copy → SAP attachment; the order is still created if only the upload fails
    let attachmentEntry: number | undefined
    let attachWarning = ''
    const [file] = formFiles(form, 'file')
    if (file) {
      await checkFile(file, ['pdf'], 'PO copy')
      try {
        attachmentEntry = await portal.uploadAttachment([new File([file], `PO_${cardCode}_${safeName(poNumber)}_${uniqueStamp()}.pdf`, { type: 'application/pdf' })])
      } catch (e) {
        attachWarning = (e as Error).message
      }
    }

    const res = await portal.createPurchaseOrderDraft({
      cardCode,
      branch: customer.branch,
      poNumber,
      poDate,
      deliveryTerms: text(po.deliveryTerms, 50),
      freight: text(po.freight, 50),
      shipTo,
      remarks: text(po.remarks, 200),
      lines: cleanLines,
      attachmentEntry,
    })
    ctx.res.statusCode = 201
    return { docEntry: res.DocEntry, docNum: res.DocNum, attachWarning }
  })

  route('POST', '/api/deliveries/:docEntry/ack', true, async (ctx) => {
    const cardCode = me(ctx).cardCode
    const docEntry = Number(ctx.params[0])
    if (!Number.isInteger(docEntry) || docEntry <= 0) throw bad('Invalid delivery.')
    const form = await readForm(ctx.req, 8 * MB)
    const input = formJson<{ receivedOn?: string; condition?: string; remarks?: string }>(form, 'ack')

    const d = await portal.getDelivery(cardCode, docEntry)
    if (d.ack) throw new HttpError(409, `${d.dn} was already acknowledged on ${d.ack.date}.`)
    const receivedOn = isoDate(input.receivedOn, 'Received date')
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) // server may run in UTC
    if (receivedOn < d.date) throw bad("Received date can't be before the dispatch date.")
    if (receivedOn > tomorrow) throw bad("Received date can't be in the future.")
    const condition = text(input.condition, 60)
    if (!condition) throw bad('Choose the condition of the goods.')
    const remarks = text(input.remarks, 150)

    let attachmentEntry: number | undefined
    let attachWarning = ''
    const [photo] = formFiles(form, 'photo')
    if (photo) {
      const ext = await checkFile(photo, ['jpg', 'png', 'pdf'], 'Photo')
      try {
        attachmentEntry = await portal.uploadAttachment([new File([photo], `ACK_${safeName(d.dn)}_${uniqueStamp()}.${ext}`, { type: photo.type })])
      } catch (e) {
        attachWarning = (e as Error).message
      }
    }
    await portal.acknowledgeDelivery(d, { receivedOn, condition, remarks, attachmentEntry })
    return { attachWarning }
  })

  /* =================================================================
   * Dispatcher
   * ===============================================================*/

  function errorResponse(e: unknown): [number, string] {
    if (e instanceof HttpError) return [e.status, e.message]
    if (e instanceof SapError) {
      if (e.status === 0) return [502, 'SAP Service Layer is not reachable right now. Please try again shortly.']
      if (e.status === 401) return [502, 'The portal lost its connection to SAP. Please try again.']
      return [e.status >= 400 && e.status < 600 ? e.status : 502, e.message]
    }
    console.error('[api] unexpected error:', e)
    return [500, 'Something went wrong on the portal server. Please try again.']
  }

  /** Handles /api/* requests; returns false for anything else so the caller can serve the app. */
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://portal.local')
    if (!url.pathname.startsWith('/api/')) return false
    const t0 = Date.now()
    const ctx: Ctx = { req, res, url, params: [], user: null, headers: {} }
    let status = 200
    try {
      const candidates = routes.filter((r) => r.path.test(url.pathname))
      const r = candidates.find((x) => x.method === req.method)
      if (!r) throw new HttpError(candidates.length ? 405 : 404, candidates.length ? 'Method not allowed.' : 'Not found.')
      ctx.params = (url.pathname.match(r.path) ?? []).slice(1).map(decodeURIComponent)
      // CSRF: browsers can't add custom headers to cross-site form posts
      if (req.method !== 'GET' && req.headers[CSRF_HEADER] !== CSRF_VALUE) throw new HttpError(403, 'Request blocked (missing portal header).')
      if (r.auth) {
        ctx.user = await currentUser(req)
        if (!ctx.user) {
          clearSession(ctx)
          throw new HttpError(401, 'Your session has expired. Please sign in again.')
        }
        setSession(ctx, ctx.user) // sliding idle timeout
      }
      const body = await r.handler(ctx)
      status = res.statusCode && res.statusCode !== 200 ? res.statusCode : 200
      sendJson(res, status, body ?? null, ctx.headers)
    } catch (e) {
      const [s, message] = errorResponse(e)
      status = s
      if (!res.headersSent) sendJson(res, s, { error: { message } }, ctx.headers)
      else res.end()
      if (req.readable) req.resume() // drain an unread upload so the connection can be reused
    }
    console.log(`[api] ${req.method} ${url.pathname} ${status} ${Date.now() - t0}ms${ctx.user ? ` (${ctx.user.cardCode})` : ''}`)
    return true
  }

  /* ---------- background: tell applicants when Sufalam approves them ---------- */

  async function checkApprovals() {
    for (const u of await users.list()) {
      if (u.status !== 'pending' || !u.registration) continue
      try {
        const ok = await approvedCustomer(u.registration.leadCode, u.email)
        if (!ok) continue
        Object.assign(u, { status: 'active', cardCode: ok.cardCode, name: ok.name })
        await users.save(u)
        console.log(`[register] ${u.email} approved → customer ${ok.cardCode}`)
        await mail(
          {
            to: u.email,
            subject: 'Sufalam portal — your account is approved',
            text: `Good news — ${ok.name} is now a Sufalam customer (code ${ok.cardCode}).\n\nSet your portal password here:\n${cfg.publicUrl}/forgot-password?email=${encodeURIComponent(u.email)}\n\nEnter this email address, and we will send you a verification code.`,
          },
          false,
        )
      } catch (e) {
        console.error(`[register] approval check for ${u.email} failed:`, (e as Error).message)
      }
    }
  }

  function startJobs(everyMs = 15 * 60_000) {
    const run = () => void checkApprovals().catch((e) => console.error('[register] approval check failed:', e))
    const first = setTimeout(run, 10_000)
    const timer = setInterval(run, everyMs)
    first.unref()
    timer.unref()
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }

  return { handle, startJobs, checkApprovals, users, mailer, close: () => sl.logout() }
}

export type PortalApp = ReturnType<typeof createApp>
