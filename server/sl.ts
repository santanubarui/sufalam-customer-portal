/*
 * Service Layer connection for the portal backend.
 *
 * The backend signs in to SL once with a restricted service user and shares that session for all portal
 * customers. Customers never see SAP credentials; each request is scoped to the signed-in customer's
 * CardCode by the API routes (server/app.ts).
 *
 * Uses node:https directly (not fetch) so internal / self-signed SL certificates can be accepted
 * without turning off TLS checks for the whole process.
 */
import http from 'node:http'
import https from 'node:https'
import { configureSap, SapError } from '../src/api/sap'
import type { ServerConfig } from './config'

const TIMEOUT_MS = 120_000

export function connectServiceLayer(cfg: ServerConfig) {
  const agent = new https.Agent({ keepAlive: true, rejectUnauthorized: !cfg.slTlsInsecure })

  /** Sends one HTTP request; `init` may carry a JSON string or FormData body. */
  async function send(url: string, init: RequestInit, cookie: string): Promise<Response> {
    const req = new Request(url, { method: init.method, headers: init.headers, body: init.body })
    const body = req.body ? Buffer.from(await req.arrayBuffer()) : undefined
    const headers: Record<string, string> = Object.fromEntries(req.headers)
    if (cookie) headers.cookie = cookie
    if (body) headers['content-length'] = String(body.length)

    const u = new URL(url)
    const lib = u.protocol === 'https:' ? https : http
    return new Promise<Response>((resolve, reject) => {
      const r = lib.request(u, { method: req.method, headers, agent: u.protocol === 'https:' ? agent : undefined, timeout: TIMEOUT_MS }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('error', reject)
        res.on('end', () => {
          const h = new Headers()
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) v.forEach((x) => h.append(k, x))
            else if (v != null) h.set(k, String(v))
          }
          const status = res.statusCode ?? 502
          resolve(new Response(status === 204 || status === 304 ? null : Buffer.concat(chunks), { status, headers: h }))
        })
      })
      r.on('timeout', () => r.destroy(new Error('Service Layer request timed out')))
      r.on('error', reject)
      if (body) r.write(body)
      r.end()
    })
  }

  let session: Promise<string> | null = null

  async function login(): Promise<string> {
    let res: Response
    try {
      res = await send(
        `${cfg.slBase}/Login`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ CompanyDB: cfg.companyDB, UserName: cfg.slUser, Password: cfg.slPassword }),
        },
        '',
      )
    } catch (e) {
      console.error(`[sl] cannot reach Service Layer at ${cfg.slBase}:`, (e as Error).message)
      throw new SapError(0, 'SAP Service Layer is not reachable right now. Please try again shortly.')
    }
    if (!res.ok) {
      console.error(`[sl] service user login failed (HTTP ${res.status}):`, (await res.text()).slice(0, 300))
      throw new SapError(503, 'The portal could not connect to SAP. Please try again later or contact Sufalam.')
    }
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    console.log(`[sl] signed in to ${cfg.companyDB} as service user`)
    return cookie
  }

  const currentSession = () => {
    if (!session) {
      const p = login()
      session = p
      p.catch(() => {
        if (session === p) session = null
      })
    }
    return session
  }

  async function slFetch(url: string, init: RequestInit): Promise<Response> {
    const s = currentSession()
    let res = await send(url, init, await s)
    if (res.status === 401) {
      // SL session timed out (default 30 min idle) — sign in again once and retry
      if (session === s) session = null
      res = await send(url, init, await currentSession())
    }
    return res
  }

  configureSap({ baseUrl: cfg.slBase, fetch: slFetch })

  return {
    /** Checks SAP user credentials with a separate SL login (closed right away). */
    async verifyUser(userName: string, password: string): Promise<boolean> {
      let res: Response
      try {
        res = await send(
          `${cfg.slBase}/Login`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ CompanyDB: cfg.companyDB, UserName: userName, Password: password }),
          },
          '',
        )
      } catch (e) {
        console.error(`[sl] cannot reach Service Layer at ${cfg.slBase}:`, (e as Error).message)
        throw new SapError(0, 'SAP Service Layer is not reachable right now. Please try again shortly.')
      }
      if (!res.ok) return false
      const cookie = res.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ')
      if (cookie) await send(`${cfg.slBase}/Logout`, { method: 'POST' }, cookie).catch(() => undefined)
      return true
    },
    async logout() {
      if (!session) return
      const cookie = await session.catch(() => '')
      session = null
      if (cookie) await send(`${cfg.slBase}/Logout`, { method: 'POST' }, cookie).catch(() => undefined)
    },
  }
}
