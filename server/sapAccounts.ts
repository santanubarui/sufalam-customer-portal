/*
 * SAP side of portal accounts:
 *   - finding the customer an email belongs to (first-time activation of existing customers)
 *   - new-customer registration → Business Partner of type Lead (cLid) with KYC attachments
 *   - checking whether Sufalam has approved a registration (lead converted to a customer)
 */
import { randomInt } from 'node:crypto'
import { lit, odata, sapList, sapRequest, SapError } from '../src/api/sap'
import { uploadAttachment } from '../src/api/portal'
import { bad } from './http'

/* =====================================================================
 * Customer lookup
 * ===================================================================*/

export interface CustomerRef {
  cardCode: string
  name: string
}

/** Active customers whose BP email address is `email`. */
export async function findCustomersByEmail(email: string): Promise<CustomerRef[]> {
  const rows = await sapList<{ CardCode: string; CardName: string }>(
    odata('BusinessPartners', {
      select: 'CardCode,CardName',
      filter: `CardType eq 'cCustomer' and Frozen eq 'tNO' and EmailAddress eq ${lit(email)}`,
    }),
    { pageSize: 5, maxPages: 1 },
  )
  return rows.map((r) => ({ cardCode: r.CardCode, name: r.CardName }))
}

/**
 * Has Sufalam approved this registration? Approved = the lead was converted to a customer in SAP,
 * or a customer with the registration email was created instead.
 */
export async function approvedCustomer(leadCode: string, email: string): Promise<CustomerRef | null> {
  try {
    const bp = await sapRequest<{ CardCode: string; CardName: string; CardType: string; Frozen: string }>(
      `BusinessPartners(${lit(leadCode)})?$select=CardCode,CardName,CardType,Frozen`,
    )
    if (bp.CardType === 'cCustomer' && bp.Frozen !== 'tYES') return { cardCode: bp.CardCode, name: bp.CardName }
  } catch (e) {
    if (!(e instanceof SapError && e.status === 404)) throw e
  }
  const byEmail = await findCustomersByEmail(email)
  return byEmail.length === 1 ? byEmail[0] : null
}

/* =====================================================================
 * Registration
 * ===================================================================*/

/** GSTIN state code → SAP state code (States table of the Sufalam company). */
const GST_STATES: Record<string, [string, string]> = {
  '01': ['JK', 'Jammu and Kashmir'], '02': ['HP', 'Himachal Pradesh'], '03': ['PB', 'Punjab'], '04': ['CH', 'Chandigarh'],
  '05': ['UK', 'Uttarakhand'], '06': ['HR', 'Haryana'], '07': ['DL', 'Delhi'], '08': ['RJ', 'Rajasthan'],
  '09': ['UP', 'Uttar Pradesh'], '10': ['BR', 'Bihar'], '11': ['SK', 'Sikkim'], '12': ['AR', 'Arunachal Pradesh'],
  '13': ['NL', 'Nagaland'], '14': ['MN', 'Manipur'], '15': ['MZ', 'Mizoram'], '16': ['TR', 'Tripura'],
  '17': ['ML', 'Meghalaya'], '18': ['AS', 'Assam'], '19': ['WB', 'West Bengal'], '20': ['JH', 'Jharkhand'],
  '21': ['OD', 'Odisha'], '22': ['CG', 'Chhattisgarh'], '23': ['MP', 'Madhya Pradesh'], '24': ['GJ', 'Gujarat'],
  '25': ['DN', 'Dadra & Nagar Haveli and Daman & Diu'], '26': ['DN', 'Dadra & Nagar Haveli and Daman & Diu'],
  '27': ['MH', 'Maharashtra'], '29': ['KT', 'Karnataka'], '30': ['GA', 'Goa'], '31': ['LD', 'Lakshadweep'],
  '32': ['KL', 'Kerala'], '33': ['TN', 'Tamil Nadu'], '34': ['PY', 'Puducherry'], '35': ['AN', 'Andaman and Nicobar Islands'],
  '36': ['TG', 'Telangana'], '37': ['AP', 'Andhra Pradesh'], '38': ['LA', 'Ladakh'], '97': ['OT', 'Other Territory'],
}

export const CONSTITUTIONS = ['Private Limited', 'Public Limited', 'LLP', 'Partnership', 'Proprietorship'] as const
const INCORPORATED = new Set(['Private Limited', 'Public Limited', 'LLP'])

export interface RegistrationInput {
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

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Normalises and validates the form; throws 400 with the first problem. */
export function validateRegistration(raw: Partial<RegistrationInput>): RegistrationInput & { state: string; stateName: string } {
  const r: RegistrationInput = {
    companyName: clean(raw.companyName, 100),
    constitution: clean(raw.constitution, 30),
    gstin: clean(raw.gstin, 15).toUpperCase().replace(/\s/g, ''),
    pan: clean(raw.pan, 10).toUpperCase().replace(/\s/g, ''),
    cin: clean(raw.cin, 21).toUpperCase().replace(/\s/g, ''),
    address: clean(raw.address, 200),
    city: clean(raw.city, 100),
    pinCode: clean(raw.pinCode, 6),
    contactPerson: clean(raw.contactPerson, 50),
    mobile: clean(raw.mobile, 20).replace(/[\s-]/g, '').replace(/^(\+91|0)/, ''),
    email: clean(raw.email, 100).toLowerCase(),
    bankAccount: clean(raw.bankAccount, 20).replace(/\s/g, ''),
    ifsc: clean(raw.ifsc, 11).toUpperCase(),
    bankBranch: clean(raw.bankBranch, 100),
  }
  const need = (ok: boolean, msg: string) => {
    if (!ok) throw bad(msg)
  }
  need(r.companyName.length >= 3, 'Enter the registered company name.')
  need((CONSTITUTIONS as readonly string[]).includes(r.constitution), 'Choose the constitution of the business.')
  need(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(r.gstin), 'Enter a valid 15-character GSTIN.')
  const st = GST_STATES[r.gstin.slice(0, 2)]
  need(!!st, 'The GSTIN state code is not recognised.')
  need(/^[A-Z]{5}\d{4}[A-Z]$/.test(r.pan), 'Enter a valid 10-character PAN.')
  need(r.gstin.slice(2, 12) === r.pan, 'PAN does not match the PAN inside the GSTIN.')
  if (INCORPORATED.has(r.constitution)) {
    need(/^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/.test(r.cin) || /^[A-Z]{3}-\d{4}$/.test(r.cin), 'Enter a valid CIN (or LLPIN for an LLP).')
  }
  need(r.address.length >= 5, 'Enter the registered address.')
  need(r.city.length >= 2, 'Enter the city.')
  need(/^[1-9]\d{5}$/.test(r.pinCode), 'Enter a valid 6-digit PIN code.')
  need(r.contactPerson.length >= 2, 'Enter the contact person.')
  need(/^[6-9]\d{9}$/.test(r.mobile), 'Enter a valid 10-digit mobile number.')
  need(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email), 'Enter a valid email address.')
  need(/^\d{9,18}$/.test(r.bankAccount), 'Enter a valid bank account number.')
  need(/^[A-Z]{4}0[A-Z0-9]{6}$/.test(r.ifsc), 'Enter a valid 11-character IFSC.')
  need(r.bankBranch.length >= 3, 'Enter the bank and branch name.')
  return { ...r, state: st[0], stateName: st[1] }
}

export const requiresCin = (constitution: string) => INCORPORATED.has(constitution)

/* ---------- KYC files ---------- */

export const KYC_DOCS = [
  { key: 'gst', label: 'GST Registration Certificate' },
  { key: 'pan', label: 'PAN Card' },
  { key: 'cheque', label: 'Cancelled Cheque' },
  { key: 'cin', label: 'Incorporation Certificate' },
  { key: 'extra', label: 'Additional attachment' },
] as const

export const MAX_FILE_MB = 5
const MAX_EXTRA = 5

const SIGNATURES: [string, number[]][] = [
  ['pdf', [0x25, 0x50, 0x44, 0x46]], // %PDF
  ['png', [0x89, 0x50, 0x4e, 0x47]],
  ['jpg', [0xff, 0xd8, 0xff]],
]

/** Checks size and real file type (magic bytes); returns the normalised extension. */
export async function checkFile(f: File, allowed: string[], label: string) {
  if (f.size > MAX_FILE_MB * 1048576) throw bad(`${label}: file must be ${MAX_FILE_MB} MB or smaller.`)
  const head = new Uint8Array(await f.slice(0, 8).arrayBuffer())
  const kind = SIGNATURES.find(([, sig]) => sig.every((b, i) => head[i] === b))?.[0]
  if (!kind || !allowed.includes(kind)) throw bad(`${label}: only ${allowed.map((a) => a.toUpperCase()).join(' / ')} files are accepted.`)
  return kind
}

export async function collectKycFiles(form: FormData, constitution: string) {
  const out: { file: File; doc: string; ext: string }[] = []
  for (const d of KYC_DOCS) {
    const files = form.getAll(d.key).filter((f): f is File => typeof f !== 'string' && f.size > 0)
    const required = d.key === 'extra' ? false : d.key === 'cin' ? requiresCin(constitution) : true
    if (required && !files.length) throw bad(`Please upload the ${d.label}.`)
    if (d.key !== 'extra' && files.length > 1) throw bad(`Upload a single file for the ${d.label}.`)
    if (files.length > MAX_EXTRA) throw bad(`You can add up to ${MAX_EXTRA} additional attachments.`)
    for (const f of files) out.push({ file: f, doc: d.key, ext: await checkFile(f, ['pdf', 'jpg', 'png'], d.label) })
  }
  return out
}

/* ---------- create the Lead in SAP ---------- */

/** yymmddhhmmss + 3 random digits — keeps attachment file names unique (SAP rejects a duplicate name). */
export const uniqueStamp = () => {
  const d = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  return `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${String(randomInt(1000)).padStart(3, '0')}`
}

/*
 * Lead codes. Sufalam's SBO_SP_TRANSACTIONNOTIFICATION requires numeric CardCodes, so the lead is created
 * with SAP's automatic BP numbering series (a lead series if one exists, else the "Customer" series, e.g.
 * 20197): SAP assigns the next number and the code stays valid when the lead is converted to a customer.
 * Without any automatic series, the next free number from LEAD_CODE_START (90001) upwards is used.
 */
const LEAD_CODE_START = 90001
let seriesLookup: Promise<number | null> | null = null

function automaticBpSeries() {
  seriesLookup ??= (async () => {
    for (const sub of ['L', 'C']) {
      try {
        const r = await sapRequest<{ value?: { Series: number; IsManual: string; Locked: string }[] }>('SeriesService_GetDocumentSeries', {
          method: 'POST',
          body: { DocumentTypeParams: { Document: '2', DocumentSubType: sub } },
        })
        const s = r.value?.find((x) => x.IsManual === 'tNO' && x.Locked === 'tNO')
        if (s) return s.Series
      } catch (e) {
        if (!(e instanceof SapError) || e.status >= 500 || e.status === 0) throw e // "no series for subtype" → try the next one
      }
    }
    return null
  })()
  seriesLookup.catch(() => (seriesLookup = null))
  return seriesLookup
}

async function nextManualLeadCode() {
  const last = await sapList<{ CardCode: string }>(
    odata('BusinessPartners', {
      select: 'CardCode',
      filter: `CardType eq 'cLid' and CardCode ge '${LEAD_CODE_START}' and CardCode lt '99999'`,
      orderby: 'CardCode desc',
      top: 1,
    }),
    { pageSize: 1, maxPages: 1 },
  )
  const n = Number(last[0]?.CardCode)
  return String(Number.isInteger(n) && n >= LEAD_CODE_START ? n + 1 : LEAD_CODE_START)
}

export async function createLead(r: ReturnType<typeof validateRegistration>, files: { file: File; doc: string; ext: string }[]) {
  // KYC documents → one SAP attachment entry; file names are made unique so SAP never rejects a duplicate name
  const tag = `${r.gstin}_${uniqueStamp()}`
  const renamed = files.map((f, i) => new File([f.file], `KYC_${tag}_${f.doc}${files.length > 1 ? `_${i + 1}` : ''}.${f.ext}`, { type: f.file.type }))
  const attachmentEntry = await uploadAttachment(renamed)

  const address = {
    AddressName: r.companyName.slice(0, 50),
    Street: r.address.slice(0, 100),
    Block: r.address.slice(100, 200) || undefined,
    City: r.city,
    ZipCode: r.pinCode,
    State: r.state,
    Country: 'IN',
    GSTIN: r.gstin,
    GstType: 'gstRegularTDSISD',
  }
  const freeText = [
    `Registered via customer portal on ${new Date().toISOString().slice(0, 10)}`,
    `Constitution: ${r.constitution}`,
    `PAN: ${r.pan}`,
    r.cin ? `CIN/LLPIN: ${r.cin}` : '',
    `Contact: ${r.contactPerson}, +91 ${r.mobile}, ${r.email}`,
    `Bank: A/c ${r.bankAccount}, IFSC ${r.ifsc}, ${r.bankBranch}`,
    `KYC documents: attachment entry ${attachmentEntry}`,
  ]
    .filter(Boolean)
    .join('\n')

  const body = (code: { CardCode: string } | { Series: number }) => ({
    ...code,
    CardName: r.companyName,
    CardType: 'cLid',
    // Sufalam's SAP rule 10005: new BPs are created inactive; Sufalam activates them on approval
    Valid: 'tNO',
    Frozen: 'tYES',
    Phone1: r.mobile,
    Cellular: r.mobile,
    EmailAddress: r.email,
    FreeText: freeText,
    AttachmentEntry: attachmentEntry,
    ContactPerson: r.contactPerson,
    ContactEmployees: [{ Name: r.contactPerson, MobilePhone: r.mobile, E_Mail: r.email }],
    BPAddresses: [
      { ...address, AddressType: 'bo_BillTo' },
      { ...address, AddressType: 'bo_ShipTo' },
    ],
    BPFiscalTaxIDCollection: [{ Address: '', AddrType: 'bo_ShipTo', TaxId0: r.pan }],
  })

  const series = await automaticBpSeries()
  if (series != null) {
    const bp = await sapRequest<{ CardCode: string }>('BusinessPartners', { method: 'POST', body: body({ Series: series }) })
    return { leadCode: bp.CardCode, attachmentEntry }
  }
  for (let attempt = 1; ; attempt++) {
    const code = await nextManualLeadCode()
    try {
      await sapRequest('BusinessPartners', { method: 'POST', body: body({ CardCode: code }) })
      return { leadCode: code, attachmentEntry }
    } catch (e) {
      // another registration took the same number at the same moment — take the next one
      if (attempt >= 3 || !(e instanceof SapError && /already exists/i.test(e.message))) throw e
    }
  }
}
