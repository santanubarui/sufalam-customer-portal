import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import type { Env } from './env'

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user?: string
  pass?: string
}

export interface ServerConfig {
  production: boolean
  port: number
  /** Service Layer root, e.g. https://host:50000/b1s/v2 */
  slBase: string
  companyDB: string
  slUser: string
  slPassword: string
  /** accept self-signed / internal SL certificates */
  slTlsInsecure: boolean
  sessionSecret: string
  /** portal session idle timeout, minutes */
  sessionMinutes: number
  cookieSecure: boolean
  /** trust X-Forwarded-For from a reverse proxy (for rate limiting by client address) */
  trustProxy: boolean
  dataDir: string
  distDir: string
  /** public address of the portal, used in email links */
  publicUrl: string
  smtp: SmtpConfig | null
  mailFrom: string
  /** Sufalam mailbox told about new registrations (optional) */
  notifyEmail: string
  /** customer (CardCode) opened when someone signs in with SAP user credentials; '' disables SAP-user sign-in */
  staffCardCode: string
  /** DTS Sufalam API root (password reset / change), e.g. https://host:port — '' when not configured */
  dtsBase: string
  /** accept the DTS API's internal / self-signed certificate */
  dtsTlsInsecure: boolean
}

const bool = (v: string | undefined, dflt: boolean) => (v == null || v === '' ? dflt : /^(1|true|yes|on)$/i.test(v))

export function readConfig(env: Env, production: boolean): ServerConfig {
  const problems: string[] = []

  // In development the existing dev SAP login (.env.development.local) is used as the service user.
  const slUser = env.SAP_SERVICE_USER || (production ? '' : env.VITE_DEV_SAP_USER) || ''
  const slPassword = env.SAP_SERVICE_PASSWORD || (production ? '' : env.VITE_DEV_SAP_PASSWORD) || ''
  if (!slUser || !slPassword) problems.push('SAP_SERVICE_USER and SAP_SERVICE_PASSWORD must be set (see .env.example).')

  const companyDB = env.SAP_COMPANY_DB || env.VITE_SAP_COMPANY_DB || ''
  if (!companyDB) problems.push('SAP_COMPANY_DB must be set.')

  let sessionSecret = env.PORTAL_SESSION_SECRET || ''
  if (sessionSecret.length < 32) {
    if (production) problems.push('PORTAL_SESSION_SECRET must be at least 32 random characters.')
    else sessionSecret = randomBytes(32).toString('hex') // dev: sessions end when the dev server restarts
  }

  if (problems.length) throw new Error(`Portal server configuration:\n  - ${problems.join('\n  - ')}`)

  const port = Number(env.PORT) || 8080
  const origin = (env.SAP_SL_ORIGIN || 'https://sufalam.connectcloud365.com:57138').replace(/\/+$/, '')

  return {
    production,
    port,
    slBase: `${origin}/b1s/v2`,
    companyDB,
    slUser,
    slPassword,
    slTlsInsecure: bool(env.SAP_TLS_INSECURE, true),
    sessionSecret,
    sessionMinutes: Number(env.PORTAL_SESSION_MINUTES) || 30,
    cookieSecure: bool(env.COOKIE_SECURE, production),
    trustProxy: bool(env.TRUST_PROXY, false),
    dataDir: resolve(env.PORTAL_DATA_DIR || 'server-data'),
    distDir: resolve(env.PORTAL_DIST_DIR || 'dist'),
    publicUrl: (env.PORTAL_PUBLIC_URL || (production ? `http://localhost:${port}` : 'http://localhost:5173')).replace(/\/+$/, ''),
    smtp: env.SMTP_HOST
      ? {
          host: env.SMTP_HOST,
          port: Number(env.SMTP_PORT) || 587,
          secure: bool(env.SMTP_SECURE, Number(env.SMTP_PORT) === 465),
          user: env.SMTP_USER || undefined,
          pass: env.SMTP_PASSWORD || undefined,
        }
      : null,
    mailFrom: env.MAIL_FROM || 'Sufalam Customer Portal <no-reply@sufalam.local>',
    notifyEmail: env.REGISTRATION_NOTIFY_EMAIL || '',
    staffCardCode: env.PORTAL_STAFF_CARD_CODE || (production ? '' : env.VITE_DEV_CARD_CODE) || '',
    // accepts the root with or without a trailing /Api
    dtsBase: (env.SUFALAM_API_URL || '').trim().replace(/\/+$/, '').replace(/\/api$/i, ''),
    dtsTlsInsecure: bool(env.SUFALAM_API_TLS_INSECURE, bool(env.SAP_TLS_INSECURE, true)),
  }
}
