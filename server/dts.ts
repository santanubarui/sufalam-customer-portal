/*
 * DTS Sufalam API (ASP.NET Web API, separate from SAP Service Layer) — password management.
 *
 *   POST Api/Auth/ForgotPassword       { UserCode, UserMail }                       → emails an OTP
 *   POST Api/Auth/OTPcheck             { UserCode, UserMail, OTP }                  → verifies the OTP
 *   POST Api/Auth/UpdatePass           { UserCode, UserMail, OTP, NewPassword, ConfirmPassword }
 *   POST Api/user_rep/ChangePassword   { UserId, OldPassword, NewPassword, ConfirmPassword }
 *
 * The documentation does not describe the response bodies, so `call` accepts the usual shapes
 * (a plain string, or an object with Status / Success / Message …) and turns a failure into an HttpError
 * carrying the API's own message.
 */
import http from 'node:http'
import https from 'node:https'
import type { ServerConfig } from './config'
import { HttpError } from './http'

const TIMEOUT_MS = 30_000

export interface ForgotPassBody {
  UserCode: string
  UserMail: string
  OTP: string
  NewPassword: string
  ConfirmPassword: string
}

export interface ChangePassBody {
  UserId: number
  OldPassword: string
  NewPassword: string
  ConfirmPassword: string
}

const FAIL_FLAG = /^(false|0|fail(ed|ure)?|error|invalid|n|no)$/i
const FAIL_TEXT = /invalid|incorrect|wrong|not\s+(found|match|valid|exist|registered)|mismatch|expired|fail|error|does\s*n[o']t|unable|denied/i

/** Pulls a human-readable message out of whatever the API returned. */
function messageOf(data: unknown): string {
  if (typeof data === 'string') return data.trim()
  if (!data || typeof data !== 'object') return ''
  const o = data as Record<string, unknown>
  for (const k of ['Message', 'message', 'Msg', 'msg', 'ResponseMessage', 'StatusMessage', 'ExceptionMessage', 'Error', 'error']) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/** true when a 2xx response still says the operation failed. */
function saysFailure(data: unknown, message: string): boolean {
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    for (const k of ['Status', 'status', 'Success', 'success', 'IsSuccess', 'isSuccess', 'Result', 'result']) {
      const v = o[k]
      if (v === false || v === 0) return true
      if (typeof v === 'string' && FAIL_FLAG.test(v.trim())) return true
      if (v === true || v === 1 || (typeof v === 'string' && /^(true|1|success|ok|y|yes)$/i.test(v.trim()))) return false
    }
  }
  // No explicit flag: judge by the wording of the message
  return !!message && FAIL_TEXT.test(message)
}

export function connectDtsApi(cfg: ServerConfig) {
  const agent = new https.Agent({ keepAlive: true, rejectUnauthorized: !cfg.dtsTlsInsecure })

  function post(path: string, body: unknown): Promise<{ status: number; text: string }> {
    const u = new URL(path, `${cfg.dtsBase}/`)
    const payload = Buffer.from(JSON.stringify(body))
    const lib = u.protocol === 'https:' ? https : http
    return new Promise((resolve, reject) => {
      const r = lib.request(
        u,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json', 'content-length': String(payload.length) },
          agent: u.protocol === 'https:' ? agent : undefined,
          timeout: TIMEOUT_MS,
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('error', reject)
          res.on('end', () => resolve({ status: res.statusCode ?? 502, text: Buffer.concat(chunks).toString('utf8') }))
        },
      )
      r.on('timeout', () => r.destroy(new Error('timed out')))
      r.on('error', reject)
      r.end(payload)
    })
  }

  /** Calls the API; returns its success message, throws HttpError with its failure message. */
  async function call(path: string, body: unknown, fallbackOk: string): Promise<{ message: string; data: unknown }> {
    if (!cfg.dtsBase) throw new HttpError(503, 'Password services are not configured on the portal server (SUFALAM_API_URL).')
    let res: { status: number; text: string }
    try {
      res = await post(path, body)
    } catch (e) {
      console.error(`[dts] ${path} failed:`, (e as Error).message)
      throw new HttpError(502, 'The Sufalam account service is not reachable right now. Please try again shortly.')
    }
    let data: unknown = res.text
    try {
      data = res.text ? JSON.parse(res.text) : null
    } catch {
      /* plain-text reply */
    }
    const message = messageOf(data)
    if (res.status >= 500) {
      console.error(`[dts] ${path} HTTP ${res.status}: ${res.text.slice(0, 500)}`)
      throw new HttpError(502, 'The Sufalam account service had a problem. Please try again shortly.')
    }
    if (res.status >= 400 || saysFailure(data, message)) {
      throw new HttpError(res.status >= 400 && res.status !== 401 && res.status !== 403 ? res.status : 400, message || 'The request was not accepted.')
    }
    return { message: message || fallbackOk, data }
  }

  return {
    configured: () => !!cfg.dtsBase,
    forgotPassword: (b: Pick<ForgotPassBody, 'UserCode' | 'UserMail'>) =>
      call('Api/Auth/ForgotPassword', { ...b, OTP: '', NewPassword: '', ConfirmPassword: '' }, 'A verification code has been sent to your email.'),
    otpCheck: (b: Pick<ForgotPassBody, 'UserCode' | 'UserMail' | 'OTP'>) =>
      call('Api/Auth/OTPcheck', { ...b, NewPassword: '', ConfirmPassword: '' }, 'Code verified.'),
    updatePassword: (b: ForgotPassBody) => call('Api/Auth/UpdatePass', b, 'Your password has been updated.'),
    changePassword: (b: ChangePassBody) => call('Api/user_rep/ChangePassword', b, 'Your password has been changed.'),
  }
}

export type DtsApi = ReturnType<typeof connectDtsApi>
