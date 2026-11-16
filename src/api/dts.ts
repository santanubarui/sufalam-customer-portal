/*
 * Browser → DTS Sufalam API (https://sap.sufalamindustries.com:22401), the same calls the DTS web app makes:
 *   GET Api/user/UserLogIn?UserCode=…&UserPassword=…   sign in
 *   GET Api/user/UserLogOut                              sign out
 * The API allows any origin (CORS *). The portal backend checks the same login again before it opens a
 * session, so this call only gives the user the API's own answer — it is not trusted on its own.
 */
import { ApiError } from './client'

const BASE = (import.meta.env.VITE_SUFALAM_API_URL || 'https://sap.sufalamindustries.com:22401').replace(/\/+$/, '').replace(/\/api$/i, '')
const TIMEOUT_MS = 30_000

/** First row of {"Table":[…]}, [ … ] or the object itself. */
function record(data: unknown): Record<string, unknown> {
  const d = Array.isArray(data) ? data[0] : data
  if (!d || typeof d !== 'object') return {}
  const o = d as Record<string, unknown>
  for (const k of ['Table', 'Data', 'data', 'User', 'Result']) {
    const inner = Array.isArray(o[k]) ? (o[k] as unknown[])[0] : o[k]
    if (inner && typeof inner === 'object') return { ...o, ...(inner as Record<string, unknown>) }
  }
  return o
}

const text = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (typeof o[k] === 'string' && (o[k] as string).trim()) return (o[k] as string).trim()
  return ''
}

async function get(path: string): Promise<{ status: number; data: unknown }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE}/${path}`, { method: 'GET', headers: { accept: 'application/json' }, signal: ctrl.signal })
    const body = await res.text()
    let data: unknown = body
    try {
      data = body ? JSON.parse(body) : null
    } catch {
      /* plain text */
    }
    return { status: res.status, data }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * GET Api/user/UserLogIn. Throws ApiError(401) with the API's message (e.g. "Wrong User Name") when it rejects
 * the login. If the API cannot be reached from the browser, it resolves and leaves the decision to the backend.
 */
export async function dtsUserLogIn(userCode: string, password: string): Promise<void> {
  const q = new URLSearchParams({ UserCode: userCode, UserPassword: password })
  let r: { status: number; data: unknown }
  try {
    r = await get(`Api/user/UserLogIn?${q}`)
  } catch {
    return // network / timeout: the backend makes the same call and reports the problem
  }
  if (r.status >= 500) return
  const o = record(r.data)
  const flag = text(o, ['msg_code', 'ReturnCode', 'Status'])
  const message = text(o, ['msg_desc', 'ReturnMsg', 'Message', 'message'])
  const empty = r.data == null || (Array.isArray(r.data) && !r.data.length)
  if (r.status >= 400 || empty || /^(n|no|f-?|false|0|fail(ed)?|error)$/i.test(flag)) {
    throw new ApiError(401, message || 'Incorrect user code or password.')
  }
}

/** GET Api/user/UserLogOut — best effort. */
export async function dtsUserLogOut(): Promise<void> {
  await get('Api/user/UserLogOut').catch(() => undefined)
}
