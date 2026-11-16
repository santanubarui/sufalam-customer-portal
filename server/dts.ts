/*
 * DTS Sufalam API (ASP.NET Web API, separate from SAP Service Layer) — password management.
 *
 *   POST Api/Auth/ForgotPassword       { UserCode, UserMail }                       → emails an OTP
 *   POST Api/Auth/OTPcheck             { UserCode, UserMail, OTP }                  → verifies the OTP
 *   POST Api/Auth/UpdatePass           { UserCode, UserMail, OTP, NewPassword, ConfirmPassword }
 *   POST Api/user_rep/ChangePassword   { UserId, OldPassword, NewPassword, ConfirmPassword }
 *   GET  Api/user/UserLogIn?UserCode=…&UserPassword=…                              → signs a user in
 *   (Api/user/UserLogOut is called by the browser — src/api/dts.ts)
 *
 * Replies are HTTP 200 with a status inside, e.g. {"Table":[{"msg_code":"N","msg_desc":"Wrong User Name"}]}
 * or [{"ReturnCode":"F-","ReturnMsg":"…"}].
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

const MESSAGE_KEYS = ['msg_desc', 'MsgDesc', 'ReturnMsg', 'returnMsg', 'Message', 'message', 'Msg', 'msg', 'ResponseMessage', 'StatusMessage', 'ExceptionMessage', 'Error', 'error']
// msg_code (e.g. {"Table":[{"msg_code":"N","msg_desc":"Wrong User Name"}]}) and ReturnCode ("F-") are what this API really sends
const FLAG_KEYS = ['msg_code', 'MsgCode', 'ReturnCode', 'returnCode', 'Status', 'status', 'Success', 'success', 'IsSuccess', 'isSuccess', 'Result', 'result']
const OK_FLAG = /^(true|1|s\+?|success|ok|y|yes)$/i
const FAIL_FLAG_CODE = /^f-?$/i

/** Pulls a human-readable message out of whatever the API returned. */
function messageOf(data: unknown): string {
  if (typeof data === 'string') return data.trim()
  const o = loginRecord(data)
  for (const k of MESSAGE_KEYS) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/** 'fail' / 'ok' when the reply carries an explicit status flag, else null. */
function flagOf(data: unknown): 'ok' | 'fail' | null {
  const o = loginRecord(data)
  for (const k of FLAG_KEYS) {
    const v = o[k]
    if (v === false || v === 0) return 'fail'
    if (typeof v === 'string' && (FAIL_FLAG.test(v.trim()) || FAIL_FLAG_CODE.test(v.trim()))) return 'fail'
    if (v === true || v === 1 || (typeof v === 'string' && OK_FLAG.test(v.trim()))) return 'ok'
  }
  return null
}

/** true when a 2xx response still says the operation failed. */
function saysFailure(data: unknown, message: string): boolean {
  const flag = flagOf(data)
  if (flag) return flag === 'fail'
  // No explicit flag: judge by the wording of the message
  return !!message && FAIL_TEXT.test(message)
}

export type DtsLogin =
  | { ok: false; message: string }
  | { ok: true; message: string; userId?: number; userCode: string; name: string; email: string; cardCode: string; fields: string[] }

const USER_ID_KEYS = ['UserId', 'UserID', 'userId', 'Userid', 'USERID', 'UId', 'Uid', 'uid', 'Id', 'ID', 'id', 'InternalKey']

/** The user record inside a login reply: the object itself, the first array row, or a Data / User / Result wrapper. */
function loginRecord(data: unknown): Record<string, unknown> {
  const d = Array.isArray(data) ? data[0] : data
  if (!d || typeof d !== 'object') return {}
  const o = d as Record<string, unknown>
  for (const k of ['Data', 'data', 'User', 'user', 'UserData', 'Result', 'result', 'Table', 'Response']) {
    const inner = Array.isArray(o[k]) ? (o[k] as unknown[])[0] : o[k]
    if (inner && typeof inner === 'object') return { ...o, ...(inner as Record<string, unknown>) }
  }
  return o
}

/** First non-empty value among the keys. */
function pick(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = o[k]
    if (v !== undefined && v !== null && typeof v !== 'object' && String(v).trim() !== '') return v
  }
  return undefined
}

export function connectDtsApi(cfg: ServerConfig) {
  const agent = new https.Agent({ keepAlive: true, rejectUnauthorized: !cfg.dtsTlsInsecure })

  function request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; text: string }> {
    const u = new URL(path, `${cfg.dtsBase}/`)
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body))
    const lib = u.protocol === 'https:' ? https : http
    const headers: Record<string, string> = { accept: 'application/json' }
    if (payload) Object.assign(headers, { 'content-type': 'application/json', 'content-length': String(payload.length) })
    return new Promise((resolve, reject) => {
      const r = lib.request(
        u,
        { method, headers, agent: u.protocol === 'https:' ? agent : undefined, timeout: TIMEOUT_MS },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('error', reject)
          res.on('end', () => resolve({ status: res.statusCode ?? 502, text: Buffer.concat(chunks).toString('utf8') }))
        },
      )
      r.on('timeout', () => r.destroy(new Error('timed out')))
      r.on('error', reject)
      r.end(payload ?? undefined)
    })
  }
  const post = (path: string, body: unknown) => request('POST', path, body)

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

  /**
   * Api/user/UserLogIn. The API takes the credentials in the query string (GET), so the URL is never logged.
   * Returns ok:false for rejected credentials; throws HttpError only when the service is unavailable.
   */
  async function userLogin(userCode: string, password: string): Promise<DtsLogin> {
    if (!cfg.dtsBase) throw new HttpError(503, 'The Sufalam account service is not configured on the portal server (SUFALAM_API_URL).')
    const q = new URLSearchParams({ UserCode: userCode, UserPassword: password })
    let res: { status: number; text: string }
    try {
      res = await request('GET', `Api/user/UserLogIn?${q}`)
    } catch (e) {
      console.error('[dts] Api/user/UserLogIn failed:', (e as Error).message)
      throw new HttpError(502, 'The Sufalam account service is not reachable right now. Please try again shortly.')
    }
    let data: unknown = res.text
    try {
      data = res.text ? JSON.parse(res.text) : null
    } catch {
      /* plain-text reply */
    }
    if (res.status >= 500) {
      console.error(`[dts] Api/user/UserLogIn HTTP ${res.status}: ${res.text.slice(0, 300)}`)
      throw new HttpError(502, 'The Sufalam account service had a problem. Please try again shortly.')
    }
    const message = messageOf(data)
    const user = loginRecord(data)
    // Fail closed: accept only an explicit success flag or a reply that actually carries a user record.
    const flag = flagOf(data)
    const hasUser = pick(user, [...USER_ID_KEYS, 'UserCode', 'userCode', 'USER_CODE', 'CardCode', 'UserMail', 'E_Mail', 'Email']) !== undefined
    const failed = res.status >= 400 || flag === 'fail' || (!flag && (!hasUser || saysFailure(data, message)))
    // the password is in the query string, so only the user code is logged
    console.log(`[dts] GET ${cfg.dtsBase}/Api/user/UserLogIn?UserCode=${userCode} → HTTP ${res.status}, ${failed ? 'rejected' : 'ok'}${message ? ` "${message}"` : ''}`)
    if (failed) {
      return { ok: false, message: message || 'Incorrect user code or password.' }
    }
    const userId = Number(pick(user, USER_ID_KEYS))
    return {
      ok: true,
      message,
      userId: Number.isInteger(userId) && userId > 0 ? userId : undefined,
      userCode: String(pick(user, ['UserCode', 'userCode', 'USER_CODE']) ?? userCode).trim(),
      name: String(pick(user, ['UserName', 'Name', 'name', 'FullName', 'CardName', 'U_NAME']) ?? '').trim(),
      email: String(pick(user, ['UserMail', 'E_Mail', 'Email', 'email', 'EmailId', 'EmailID', 'E_Mail', 'Mail', 'EmailAddress']) ?? '').trim(),
      cardCode: String(pick(user, ['CardCode', 'cardCode', 'CustomerCode', 'BPCode', 'CustCode']) ?? '').trim(),
      // field names only (no values) — for diagnosing replies whose shape the API docs don't describe
      fields: typeof data === 'object' && data ? Object.keys(user) : [`(${typeof data})`],
    }
  }

  return {
    configured: () => !!cfg.dtsBase,
    userLogin,
    forgotPassword: (b: Pick<ForgotPassBody, 'UserCode' | 'UserMail'>) =>
      call('Api/Auth/ForgotPassword', { ...b, OTP: '', NewPassword: '', ConfirmPassword: '' }, 'A verification code has been sent to your email.'),
    otpCheck: (b: Pick<ForgotPassBody, 'UserCode' | 'UserMail' | 'OTP'>) =>
      call('Api/Auth/OTPcheck', { ...b, NewPassword: '', ConfirmPassword: '' }, 'Code verified.'),
    updatePassword: (b: ForgotPassBody) => call('Api/Auth/UpdatePass', b, 'Your password has been updated.'),
    changePassword: (b: ChangePassBody) => call('Api/user_rep/ChangePassword', b, 'Your password has been changed.'),
  }
}

export type DtsApi = ReturnType<typeof connectDtsApi>
