/*
 * Thin client for SAP Business One Service Layer (OData v4, /b1s/v2).
 * Session is cookie based (B1SESSION + ROUTEID), so every call uses credentials: 'include'.
 */

export const SAP_BASE = (import.meta.env.VITE_SAP_BASE_URL || '/b1s/v2').replace(/\/+$/, '')

export class SapError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string | number,
  ) {
    super(message)
    this.name = 'SapError'
  }
}

/** Turns anything thrown by an API call into a message fit for the UI. */
export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'Something went wrong. Please try again.'

/* ---------- session-expiry hook (set by the portal provider) ---------- */

let sessionExpiredHandler: (() => void) | null = null
export const onSessionExpired = (fn: (() => void) | null) => {
  sessionExpiredHandler = fn
}

/* ---------- request ---------- */

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Overrides SL's default page size (20) via `Prefer: odata.maxpagesize`. */
  pageSize?: number
  headers?: Record<string, string>
  signal?: AbortSignal
  /** Don't treat 401 as an expired session (used by Login). */
  isLogin?: boolean
}

function sapMessage(body: unknown): { message?: string; code?: string | number } {
  const err = (body as { error?: { code?: string | number; message?: unknown } } | null)?.error
  if (!err) return {}
  const m = err.message
  // v2 returns `message: "text"`, v1 returns `message: { lang, value }`
  const message = typeof m === 'string' ? m : (m as { value?: string } | undefined)?.value
  return { message: message || undefined, code: err.code }
}

function friendly(status: number, sapText: string | undefined, isLogin: boolean) {
  if (isLogin && (status === 401 || /login/i.test(sapText ?? ''))) {
    return 'Sign-in failed: invalid company database, user name or password.'
  }
  if (status === 401) return 'Your SAP session has expired. Please sign in again.'
  if (status === 403) return sapText || 'You are not authorised to perform this action in SAP.'
  if (status === 404) return sapText || 'The requested record was not found in SAP.'
  if (status === 502 || status === 503 || status === 504) return 'SAP Service Layer is not reachable right now. Please try again shortly.'
  return sapText || `SAP Service Layer returned an error (HTTP ${status}).`
}

export async function sapRequest<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, pageSize, signal, isLogin = false } = opts
  const isForm = body instanceof FormData
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers }
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
  if (pageSize) headers.Prefer = `odata.maxpagesize=${pageSize}`

  let res: Response
  try {
    res = await fetch(`${SAP_BASE}/${path.replace(/^\/+/, '')}`, {
      method,
      credentials: 'include',
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new SapError(0, 'Cannot reach SAP Service Layer. Check your internet connection and try again.')
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!res.ok) {
    const { message, code } = sapMessage(data)
    if (res.status === 401 && !isLogin) sessionExpiredHandler?.()
    throw new SapError(res.status, friendly(res.status, message, isLogin), code)
  }
  return data as T
}

/* ---------- OData helpers ---------- */

/** Quotes a string literal for $filter / keys:  O'Neil -> 'O''Neil' */
export const lit = (s: string) => `'${String(s).replace(/'/g, "''")}'`

export interface ODataQuery {
  select?: string
  filter?: string
  orderby?: string
  top?: number
  skip?: number
}

export function odata(resource: string, q: ODataQuery = {}) {
  const parts: string[] = []
  if (q.select) parts.push(`$select=${encodeURIComponent(q.select)}`)
  if (q.filter) parts.push(`$filter=${encodeURIComponent(q.filter)}`)
  if (q.orderby) parts.push(`$orderby=${encodeURIComponent(q.orderby)}`)
  if (q.top != null) parts.push(`$top=${q.top}`)
  if (q.skip != null) parts.push(`$skip=${q.skip}`)
  return parts.length ? `${resource}?${parts.join('&')}` : resource
}

interface Page<T> {
  value: T[]
  '@odata.nextLink'?: string
  'odata.nextLink'?: string
}

/** Fetches a collection, following server-side paging up to `maxPages`. */
export async function sapList<T>(path: string, { pageSize = 100, maxPages = 10, signal }: { pageSize?: number; maxPages?: number; signal?: AbortSignal } = {}) {
  const out: T[] = []
  let next: string | undefined = path
  for (let i = 0; next && i < maxPages; i++) {
    const page: Page<T> = await sapRequest<Page<T>>(next, { pageSize, signal })
    out.push(...(page.value ?? []))
    const link = page['@odata.nextLink'] ?? page['odata.nextLink']
    // v2 links are relative to the service root; v1 links are absolute paths (/b1s/v1/...)
    next = link ? link.replace(/^.*\/b1s\/v\d\//, '') : undefined
  }
  return out
}

/* ---------- session ---------- */

export interface LoginInput {
  CompanyDB: string
  UserName: string
  Password: string
}

export interface LoginResult {
  SessionId: string
  Version: string
  SessionTimeout: number
}

export const sapLogin = (input: LoginInput) => sapRequest<LoginResult>('Login', { method: 'POST', body: input, isLogin: true })

export async function sapLogout() {
  try {
    await sapRequest('Logout', { method: 'POST', isLogin: true })
  } catch {
    /* session may already be gone — nothing to do */
  }
}
