import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export const bad = (message: string) => new HttpError(400, message)

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
    ...headers,
  })
  res.end(text)
}

function tooLarge(req: IncomingMessage, limit: number) {
  const len = Number(req.headers['content-length'] || 0)
  if (len > limit) throw new HttpError(413, `Upload is too large (limit ${Math.round(limit / 1048576)} MB).`)
}

/** Converts the Node request into a web Request so the standard body parsers can be used. */
function toWebRequest(req: IncomingMessage, limit: number) {
  tooLarge(req, limit)
  let seen = 0
  const limited = Readable.from(
    (async function* () {
      for await (const chunk of req as AsyncIterable<Buffer>) {
        seen += chunk.length
        if (seen > limit) throw new HttpError(413, `Upload is too large (limit ${Math.round(limit / 1048576)} MB).`)
        yield chunk
      }
    })(),
  )
  return new Request('http://portal.local/', {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: Readable.toWeb(limited) as ReadableStream,
    // @ts-expect-error -- required by Node for streamed request bodies; not in the DOM typings
    duplex: 'half',
  })
}

export async function readJson<T>(req: IncomingMessage, limit = 256 * 1024): Promise<T> {
  if (!/application\/json/i.test(req.headers['content-type'] ?? '')) throw bad('Expected a JSON request body.')
  try {
    return (await toWebRequest(req, limit).json()) as T
  } catch (e) {
    if (e instanceof HttpError) throw e
    throw bad('The request body is not valid JSON.')
  }
}

export async function readForm(req: IncomingMessage, limit: number): Promise<FormData> {
  if (!/multipart\/form-data/i.test(req.headers['content-type'] ?? '')) throw bad('Expected a multipart/form-data request.')
  try {
    return await toWebRequest(req, limit).formData()
  } catch (e) {
    if (e instanceof HttpError) throw e
    const cause = (e as { cause?: unknown } | null)?.cause
    if (cause instanceof HttpError) throw cause
    throw bad('The upload could not be read. Please try again.')
  }
}

/** Reads a JSON-encoded form field. */
export function formJson<T>(form: FormData, name: string): T {
  const v = form.get(name)
  if (typeof v !== 'string') throw bad(`Missing "${name}" in the request.`)
  try {
    return JSON.parse(v) as T
  } catch {
    throw bad(`"${name}" is not valid JSON.`)
  }
}

export const formFiles = (form: FormData, name: string) =>
  form.getAll(name).filter((f): f is File => typeof f !== 'string' && f.size > 0)

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) {
      try {
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
      } catch {
        /* ignore malformed cookie */
      }
    }
  }
  return out
}

export function cookie(name: string, value: string, opts: { maxAge: number; secure: boolean }) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${opts.maxAge}`,
    ...(opts.secure ? ['Secure'] : []),
  ].join('; ')
}

/** Client address; X-Forwarded-For is only trusted when the portal runs behind a reverse proxy (TRUST_PROXY=true). */
export const clientIp = (req: IncomingMessage, trustProxy: boolean) =>
  ((trustProxy && String(req.headers['x-forwarded-for'] ?? '').split(',').pop()?.trim()) || req.socket.remoteAddress) ?? 'unknown'

/** Fixed-window counter used to slow down password guessing and OTP abuse. */
export class RateLimiter {
  private hits = new Map<string, { n: number; until: number }>()
  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  /** Throws 429 when `key` exceeded the limit in the current window. */
  hit(key: string, message = 'Too many attempts. Please wait a few minutes and try again.') {
    const now = Date.now()
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.until < now) this.hits.delete(k)
    const h = this.hits.get(key)
    if (!h || h.until < now) return void this.hits.set(key, { n: 1, until: now + this.windowMs })
    if (++h.n > this.max) throw new HttpError(429, message)
  }

  reset(key: string) {
    this.hits.delete(key)
  }
}
