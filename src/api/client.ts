/*
 * Browser → portal backend (/api). The backend talks to SAP Service Layer with its own service user and
 * scopes every call to the signed-in customer, so no SAP credentials or customer codes are sent from here.
 * Data shapes are the ones defined in ./portal.ts.
 */
import type {
  Customer,
  Delivery,
  LedgerRow,
  NewPurchaseOrder,
  OpenInvoice,
  Order,
  Payment,
  ProformaInvoice,
  SalesItem,
} from './portal'

export { errorMessage } from './sap'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/* ---------- session-expiry hook (set by the portal provider) ---------- */

let sessionExpiredHandler: (() => void) | null = null
export const onSessionExpired = (fn: (() => void) | null) => {
  sessionExpiredHandler = fn
}

/* ---------- request ---------- */

interface Opts {
  method?: 'GET' | 'POST'
  body?: unknown
  signal?: AbortSignal
  /** 401 here means "wrong credentials", not "session expired" */
  anonymous?: boolean
}

async function api<T>(path: string, { method = 'GET', body, signal, anonymous = false }: Opts = {}): Promise<T> {
  const isForm = body instanceof FormData
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (method !== 'GET') headers['X-Requested-With'] = 'sufalam-portal'
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(`/api/${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new ApiError(0, 'Cannot reach the Sufalam portal. Check your internet connection and try again.')
  }

  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    if (res.status === 401 && !anonymous) sessionExpiredHandler?.()
    const msg = (data as { error?: { message?: string } } | null)?.error?.message
    throw new ApiError(
      res.status,
      msg || (res.status >= 502 ? 'The portal server is not reachable right now. Please try again shortly.' : `Request failed (HTTP ${res.status}).`),
    )
  }
  return data as T
}

const form = (fields: Record<string, unknown>, files: Record<string, File | File[] | null | undefined>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.append(k, JSON.stringify(v))
  for (const [k, v] of Object.entries(files)) for (const file of Array.isArray(v) ? v : v ? [v] : []) f.append(k, file, file.name)
  return f
}

/* =====================================================================
 * Accounts
 * ===================================================================*/

export interface PortalUser {
  email: string
  cardCode: string
  name: string
}

export const auth = {
  me: (signal?: AbortSignal) => api<{ user: PortalUser }>('auth/me', { signal, anonymous: true }),
  login: (email: string, password: string) =>
    api<{ user: PortalUser; customer: Customer }>('auth/login', { method: 'POST', body: { email, password }, anonymous: true }),
  logout: () => api<{ ok: true }>('auth/logout', { method: 'POST', anonymous: true }).catch(() => undefined),
  /** Sends a 6-digit code (password reset, or first sign-in of an existing customer / approved registration). */
  forgotPassword: (email: string) => api<{ message: string }>('auth/password/forgot', { method: 'POST', body: { email }, anonymous: true }),
  resetPassword: (email: string, code: string, password: string) =>
    api<{ message: string }>('auth/password/reset', { method: 'POST', body: { email, code, password }, anonymous: true }),
}

export interface RegistrationData {
  companyName: string
  constitution: string
  gstin: string
  pan: string
  cin: string
  address: string
  city: string
  pinCode: string
  contactPerson: string
  mobile: string
  email: string
  bankAccount: string
  ifsc: string
  bankBranch: string
}

/** New customer application → SAP lead with KYC attachments. `files` is keyed gst / pan / cheque / cin / extra. */
export const registerCustomer = (data: RegistrationData, files: Record<string, File[]>) =>
  api<{ reference: string; message: string }>('register', { method: 'POST', body: form({ data }, files), anonymous: true })

/* =====================================================================
 * Customer data (always the signed-in customer)
 * ===================================================================*/

export const getCustomer = (signal?: AbortSignal) => api<Customer>('customer', { signal })
export const getOrders = (signal?: AbortSignal) => api<Order[]>('orders', { signal })
export const getSalesItems = (signal?: AbortSignal) => api<SalesItem[]>('items', { signal })
export const getOpenInvoices = (signal?: AbortSignal) => api<OpenInvoice[]>('invoices/open', { signal })
export const getPendingProformas = (signal?: AbortSignal) => api<ProformaInvoice[]>('proformas', { signal })
export const getPayments = (signal?: AbortSignal) => api<Payment[]>('payments', { signal })
export const getDeliveries = (signal?: AbortSignal) => api<{ inTransit: Delivery[]; acknowledged: Delivery[] }>('deliveries', { signal })
export const getLedger = (from: string, to: string, signal?: AbortSignal) =>
  api<{ opening: number; closing: number; rows: LedgerRow[] }>(`ledger?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { signal })

export type PurchaseOrderInput = Omit<NewPurchaseOrder, 'cardCode' | 'branch' | 'attachmentEntry'>

/** Creates the PO as a sales-order draft in SAP; `attachWarning` is set when only the PDF upload failed. */
export const submitPurchaseOrder = (po: PurchaseOrderInput, file: File | null) =>
  api<{ docEntry: number; docNum: number; attachWarning: string }>('orders', { method: 'POST', body: form({ po }, { file }) })

export const acknowledgeDelivery = (docEntry: number, ack: { receivedOn: string; condition: string; remarks: string }, photo: File | null) =>
  api<{ attachWarning: string }>(`deliveries/${docEntry}/ack`, { method: 'POST', body: form({ ack }, { photo }) })
