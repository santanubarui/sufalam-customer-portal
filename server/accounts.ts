/*
 * Portal accounts (separate from SAP users).
 *
 * Stored in <PORTAL_DATA_DIR>/users.json — one record per login email, linked to one SAP customer
 * (CardCode). Passwords are scrypt hashes. The file is small (one row per customer contact), written
 * atomically, and must be backed up with the server.
 */
import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>

export type AccountStatus = 'active' | 'pending' | 'disabled'

export interface Registration {
  submittedAt: string
  leadCode: string
  companyName: string
  gstin: string
  mobile: string
  contactPerson: string
}

export interface PortalUser {
  email: string
  /** SAP CardCode — a Lead (cLid) while the registration is pending, a Customer once approved */
  cardCode: string
  name: string
  status: AccountStatus
  passwordHash?: string
  /** incremented on password change / disable — invalidates existing sessions */
  sessionVersion: number
  createdAt: string
  updatedAt: string
  lastLoginAt?: string
  registration?: Registration
}

export const normEmail = (e: string) => String(e ?? '').trim().toLowerCase()
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 100

/* ---------- user store ---------- */

export class UserStore {
  private users = new Map<string, PortalUser>()
  private loaded: Promise<void> | null = null
  private writing: Promise<void> = Promise.resolve()

  constructor(private dir: string) {}

  private get file() {
    return join(this.dir, 'users.json')
  }

  private load() {
    this.loaded ??= (async () => {
      try {
        const list = JSON.parse(await readFile(this.file, 'utf8')) as PortalUser[]
        list.forEach((u) => this.users.set(normEmail(u.email), u))
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      }
    })()
    return this.loaded
  }

  private persist() {
    const data = JSON.stringify([...this.users.values()], null, 1)
    this.writing = this.writing.then(async () => {
      await mkdir(this.dir, { recursive: true })
      const tmp = `${this.file}.${process.pid}.tmp`
      await writeFile(tmp, data, { mode: 0o600 })
      await rename(tmp, this.file)
    })
    return this.writing
  }

  async get(email: string) {
    await this.load()
    return this.users.get(normEmail(email))
  }

  async list() {
    await this.load()
    return [...this.users.values()]
  }

  async save(user: PortalUser) {
    await this.load()
    user.email = normEmail(user.email)
    user.updatedAt = new Date().toISOString()
    this.users.set(user.email, user)
    await this.persist()
    return user
  }

  async remove(email: string) {
    await this.load()
    const ok = this.users.delete(normEmail(email))
    if (ok) await this.persist()
    return ok
  }
}

/* ---------- passwords ---------- */

export const MIN_PASSWORD = 8

export function passwordProblem(pw: string) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`
  if (pw.length > 200) return 'Password is too long.'
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain letters and numbers.'
  return ''
}

export async function hashPassword(pw: string) {
  const salt = randomBytes(16)
  const hash = await scryptAsync(pw, salt, 64)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function verifyPassword(pw: string, stored: string | undefined) {
  const [kind, salt, hash] = (stored ?? '').split('$')
  if (kind !== 'scrypt' || !salt || !hash) {
    await scryptAsync(pw, randomBytes(16), 64) // same cost either way, so timing doesn't reveal unknown accounts
    return false
  }
  const expected = Buffer.from(hash, 'base64')
  const actual = await scryptAsync(pw, Buffer.from(salt, 'base64'), expected.length)
  return timingSafeEqual(actual, expected)
}

/* ---------- session tokens (signed, stored in an HttpOnly cookie) ---------- */

export interface SessionClaims {
  email: string
  ver: number
  exp: number
}

const b64 = (s: string) => Buffer.from(s).toString('base64url')

export function signSession(claims: SessionClaims, secret: string) {
  const payload = b64(JSON.stringify(claims))
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
}

export function readSession(token: string | undefined, secret: string): SessionClaims | null {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const want = createHmac('sha256', secret).update(payload).digest()
  const got = Buffer.from(sig, 'base64url')
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  try {
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionClaims
    return c.exp > Date.now() ? c : null
  } catch {
    return null
  }
}

/* ---------- one-time codes (password reset / first sign-in) ---------- */

const OTP_TTL_MS = 10 * 60_000
const OTP_RESEND_MS = 60_000
const OTP_MAX_TRIES = 5

interface OtpEntry {
  hash: string
  exp: number
  sentAt: number
  tries: number
  /** customer the account will be linked to when the code is used */
  cardCode: string
  name: string
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

export class OtpStore {
  private codes = new Map<string, OtpEntry>()

  /** Seconds the caller must wait before another code may be sent (0 = may send now). */
  waitSeconds(email: string) {
    const e = this.codes.get(normEmail(email))
    return e ? Math.max(0, Math.ceil((e.sentAt + OTP_RESEND_MS - Date.now()) / 1000)) : 0
  }

  issue(email: string, link: { cardCode: string; name: string }) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const now = Date.now()
    for (const [k, v] of this.codes) if (v.exp < now) this.codes.delete(k)
    this.codes.set(normEmail(email), { hash: sha(`${normEmail(email)}:${code}`), exp: now + OTP_TTL_MS, sentAt: now, tries: 0, ...link })
    return code
  }

  /** Returns the linked customer when the code is right; burns the code after success or too many tries. */
  consume(email: string, code: string): { cardCode: string; name: string } | 'expired' | 'wrong' | 'locked' {
    const key = normEmail(email)
    const e = this.codes.get(key)
    if (!e || e.exp < Date.now()) return 'expired'
    if (e.tries >= OTP_MAX_TRIES) return 'locked'
    const a = Buffer.from(sha(`${key}:${String(code).trim()}`))
    if (!timingSafeEqual(a, Buffer.from(e.hash))) {
      e.tries++
      return e.tries >= OTP_MAX_TRIES ? 'locked' : 'wrong'
    }
    this.codes.delete(key)
    return { cardCode: e.cardCode, name: e.name }
  }
}

export const OTP_MINUTES = OTP_TTL_MS / 60_000
