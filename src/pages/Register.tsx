import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Brandmark } from '../components/ui'
import { useToast } from '../components/toast'
import { errorMessage, registerCustomer, type RegistrationData } from '../api/client'

const steps = ['Company details', 'KYC documents', 'Review & submit']
const DRAFT_KEY = 'sufalam.registrationDraft'
const MAX_MB = 5

const CONSTITUTIONS = ['Private Limited', 'Public Limited', 'LLP', 'Partnership', 'Proprietorship']
const needsCin = (c: string) => ['Private Limited', 'Public Limited', 'LLP'].includes(c)

const kycDocs = [
  { key: 'gst', icon: '📄', label: 'GST Registration Certificate', hint: 'PDF · max 5 MB' },
  { key: 'pan', icon: '🪪', label: 'PAN Card', hint: 'PDF / JPG · max 5 MB' },
  { key: 'cheque', icon: '🏦', label: 'Cancelled Cheque', hint: 'PDF / JPG / PNG · max 5 MB' },
  { key: 'cin', icon: '🏢', label: 'Incorporation Certificate (CIN / LLPIN)', hint: 'PDF · max 5 MB · companies and LLPs' },
  { key: 'extra', icon: '➕', label: 'Additional attachments', hint: 'Up to 5 files · optional (MSME, TDS declaration, etc.)' },
]

const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Dadra & Nagar Haveli and Daman & Diu', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
}

const EMPTY: RegistrationData = {
  companyName: '',
  constitution: 'Private Limited',
  gstin: '',
  pan: '',
  cin: '',
  address: '',
  city: '',
  pinCode: '',
  contactPerson: '',
  mobile: '',
  email: '',
  bankAccount: '',
  ifsc: '',
  bankBranch: '',
}

const loadDraft = (): RegistrationData => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<RegistrationData>) } : EMPTY
  } catch {
    return EMPTY
  }
}

/** Same rules as the server (server/sapAccounts.ts), checked early so the user can fix them before uploading. */
function detailsProblem(d: RegistrationData) {
  const gstin = d.gstin.toUpperCase()
  const pan = d.pan.toUpperCase()
  const mobile = d.mobile.replace(/[\s-]/g, '').replace(/^(\+91|0)/, '')
  if (d.companyName.trim().length < 3) return 'Enter the registered company name.'
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return 'Enter a valid 15-character GSTIN.'
  if (!GST_STATES[gstin.slice(0, 2)]) return 'The GSTIN state code is not recognised.'
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) return 'Enter a valid 10-character PAN.'
  if (gstin.slice(2, 12) !== pan) return 'PAN does not match the PAN inside the GSTIN.'
  if (needsCin(d.constitution) && !/^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$|^[A-Z]{3}-\d{4}$/.test(d.cin.toUpperCase()))
    return 'Enter a valid CIN (or LLPIN for an LLP).'
  if (d.address.trim().length < 5) return 'Enter the registered address.'
  if (d.city.trim().length < 2) return 'Enter the city.'
  if (!/^[1-9]\d{5}$/.test(d.pinCode.trim())) return 'Enter a valid 6-digit PIN code.'
  if (d.contactPerson.trim().length < 2) return 'Enter the contact person.'
  if (!/^[6-9]\d{9}$/.test(mobile)) return 'Enter a valid 10-digit mobile number.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim())) return 'Enter a valid email address.'
  if (!/^\d{9,18}$/.test(d.bankAccount.replace(/\s/g, ''))) return 'Enter a valid bank account number.'
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(d.ifsc.toUpperCase())) return 'Enter a valid 11-character IFSC.'
  if (d.bankBranch.trim().length < 3) return 'Enter the bank and branch name.'
  return ''
}

export default function Register() {
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [data, setData] = useState<RegistrationData>(loadDraft)
  const [files, setFiles] = useState<Record<string, File[]>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reference, setReference] = useState('')
  const submitted = !!reference

  const set = (k: keyof RegistrationData) => (e: { target: { value: string } }) => setData((d) => ({ ...d, [k]: e.target.value }))
  const docs = kycDocs.filter((d) => d.key !== 'cin' || needsCin(data.constitution))
  const missingDocs = docs.filter((d) => d.key !== 'extra' && !files[d.key]?.length)
  const oversize = Object.values(files).flat().find((f) => f.size > MAX_MB * 1048576)
  const state = GST_STATES[data.gstin.slice(0, 2)] ?? ''

  const next = () => {
    const problem = step === 0 ? detailsProblem(data) : missingDocs.length ? `Please upload: ${missingDocs.map((d) => d.label).join(', ')}.` : oversize ? `${oversize.name} is larger than ${MAX_MB} MB.` : ''
    setError(problem)
    if (problem) return toast.error('Please check the form', problem)
    setStep(step + 1)
  }

  const saveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
      toast.success('Draft saved', 'Your details are saved on this device. Documents must be attached again.')
    } catch {
      toast.error('Could not save draft', 'Browser storage is unavailable.')
    }
  }

  const submit = async () => {
    const problem = detailsProblem(data) || (missingDocs.length ? 'Some required documents are missing.' : '')
    setError(problem)
    if (problem) return toast.error('Please check the form', problem)
    setBusy(true)
    try {
      const sendFiles = Object.fromEntries(Object.entries(files).filter(([k]) => docs.some((d) => d.key === k)))
      const r = await registerCustomer({ ...data, cin: needsCin(data.constitution) ? data.cin : '' }, sendFiles)
      setReference(r.reference)
      try {
        localStorage.removeItem(DRAFT_KEY)
      } catch {
        /* ignore */
      }
      toast.success('Application submitted', `Your reference number is ${r.reference}.`)
    } catch (err) {
      const msg = errorMessage(err)
      setError(msg)
      toast.error('Registration failed', msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="reg-wrap">
      <div className="reg-head">
        <Brandmark />
        <div>
          <h2>New Customer Registration</h2>
          <small className="muted">
            Sufalam Industries Limited — approved accounts get portal login within 1 working day
          </small>
        </div>
      </div>

      <div className="reg-card">
        <div className="stepper">
          {steps.map((label, i) => (
            <div key={label} className={`step ${i < step || submitted ? 'done' : i === step ? 'now' : ''}`}>
              <div className="dot">{i < step || submitted ? '✓' : i + 1}</div>
              {label}
            </div>
          ))}
        </div>

        {submitted ? (
          <div className="bd">
            <div className="section-label">Application submitted</div>
            <p className="auth-note">
              Thank you. Your reference number is <b>{reference}</b>. Your application has gone to Sufalam's approving
              authority. Once it is approved you will receive an email at <b>{data.email}</b> with a link to set your
              portal password. <Link to="/login">Back to sign in</Link>
            </p>
          </div>
        ) : (
          <>
            {/* Steps stay mounted (hidden) so entered values survive Back/Continue. */}
            <div hidden={step !== 0}>
              <div className="section-label">Company details</div>
              <div className="grid2">
                <div className="field"><label>Company name *</label><input placeholder="Registered company name" maxLength={100} value={data.companyName} onChange={set('companyName')} /></div>
                <div className="field">
                  <label>Constitution *</label>
                  <select value={data.constitution} onChange={set('constitution')}>
                    {CONSTITUTIONS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field"><label>GSTIN *</label><input placeholder="19AABCE1234F1Z6" maxLength={15} value={data.gstin} onChange={(e) => setData((d) => ({ ...d, gstin: e.target.value.toUpperCase().trim(), pan: d.pan || e.target.value.toUpperCase().slice(2, 12) }))} /></div>
                <div className="field"><label>PAN *</label><input placeholder="AABCE1234F" maxLength={10} value={data.pan} onChange={(e) => setData((d) => ({ ...d, pan: e.target.value.toUpperCase().trim() }))} /></div>
                <div className="field">
                  <label>CIN / LLPIN {needsCin(data.constitution) ? '*' : '(not applicable)'}</label>
                  <input placeholder="U24100WB2015PTC123456" maxLength={21} disabled={!needsCin(data.constitution)} value={needsCin(data.constitution) ? data.cin : ''} onChange={(e) => setData((d) => ({ ...d, cin: e.target.value.toUpperCase().trim() }))} />
                </div>
                <div className="field"><label>State (auto from GSTIN)</label><input disabled placeholder="—" value={state} /></div>
              </div>
              <div className="grid3">
                <div className="field"><label>Registered address *</label><input placeholder="Building, street, area" maxLength={200} value={data.address} onChange={set('address')} /></div>
                <div className="field"><label>City *</label><input maxLength={100} value={data.city} onChange={set('city')} /></div>
                <div className="field"><label>PIN code *</label><input inputMode="numeric" maxLength={6} value={data.pinCode} onChange={set('pinCode')} /></div>
              </div>
              <div className="grid3">
                <div className="field"><label>Contact person *</label><input placeholder="Full name" maxLength={50} value={data.contactPerson} onChange={set('contactPerson')} /></div>
                <div className="field"><label>Mobile *</label><input placeholder="+91" inputMode="tel" maxLength={16} value={data.mobile} onChange={set('mobile')} /></div>
                <div className="field"><label>Email (login ID) *</label><input type="email" placeholder="verified by OTP" maxLength={100} value={data.email} onChange={set('email')} /></div>
              </div>

              <div className="section-label">Bank details (as per cancelled cheque)</div>
              <div className="grid3">
                <div className="field"><label>Account number *</label><input inputMode="numeric" maxLength={20} value={data.bankAccount} onChange={set('bankAccount')} /></div>
                <div className="field"><label>IFSC *</label><input maxLength={11} value={data.ifsc} onChange={(e) => setData((d) => ({ ...d, ifsc: e.target.value.toUpperCase().trim() }))} /></div>
                <div className="field"><label>Bank &amp; branch *</label><input maxLength={100} value={data.bankBranch} onChange={set('bankBranch')} /></div>
              </div>
            </div>

            <div hidden={step !== 1}>
              <div className="section-label">KYC document uploads</div>
              <div className="upload-grid">
                {docs.map((d) => {
                  const picked = files[d.key] ?? []
                  const done = picked.length > 0
                  const required = d.key !== 'extra'
                  return (
                    <label key={d.key} className={`upl ${done ? 'done' : ''} ${required ? '' : 'wide'}`}>
                      <input
                        type="file"
                        multiple={!required}
                        accept={d.key === 'gst' || d.key === 'cin' ? '.pdf' : '.pdf,.jpg,.jpeg,.png'}
                        onChange={(e) => setFiles((f) => ({ ...f, [d.key]: Array.from(e.target.files ?? []).slice(0, 5) }))}
                      />
                      <div className="ic">{d.icon}</div>
                      <div>
                        <b>{d.label}</b>
                        <small>
                          {done
                            ? picked.map((p) => `${p.name} · ${(p.size / 1048576).toFixed(1)} MB`).join(', ')
                            : d.hint}
                        </small>
                      </div>
                      {required ? (
                        <span className="req">{done ? 'Uploaded' : 'Required'}</span>
                      ) : (
                        <span className="opt">{done ? `${picked.length} file(s)` : 'Optional'}</span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>

            {step === 2 && (
              <div>
                <div className="section-label">Review &amp; submit</div>
                <p className="auth-note">
                  <b>{data.companyName}</b> ({data.constitution}) · GSTIN {data.gstin} · PAN {data.pan}
                  {needsCin(data.constitution) ? ` · CIN ${data.cin}` : ''}
                  <br />
                  {data.address}, {data.city} {data.pinCode}, {state}
                  <br />
                  {data.contactPerson} · {data.mobile} · {data.email}
                  <br />
                  Bank A/c {data.bankAccount} · {data.ifsc} · {data.bankBranch}
                  <br />
                  Documents: {Object.values(files).flat().length} file(s) attached.{' '}
                  {missingDocs.length > 0 && (
                    <b style={{ color: 'var(--red)' }}>
                      Missing: {missingDocs.map((d) => d.label).join(', ')}.
                    </b>
                  )}
                </p>
              </div>
            )}

            {error && (
              <p className="form-error" role="alert" style={{ marginTop: '1rem' }}>
                {error}
              </p>
            )}

            <div className="btn-row" style={{ marginTop: '1.8rem' }}>
              {step > 0 ? (
                <button className="btn btn-ghost" disabled={busy} onClick={() => { setError(''); setStep(step - 1) }}>
                  ← Back
                </button>
              ) : (
                <Link className="btn btn-ghost" to="/login">
                  ← Sign in
                </Link>
              )}
              <span className="spacer" />
              <button className="btn btn-ghost" disabled={busy} onClick={saveDraft}>Save draft</button>
              {step < 2 ? (
                <button className="btn btn-grad" onClick={next}>
                  {step === 0 ? 'Continue to KYC →' : 'Continue to review →'}
                </button>
              ) : (
                <button className="btn btn-grad" disabled={missingDocs.length > 0 || busy} onClick={() => void submit()}>
                  {busy ? 'Submitting…' : 'Submit application ✓'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
      <p className="footer-note">
        After submission your application goes to Sufalam's approving authority. You will receive your login credentials
        by email once approved.
      </p>
    </div>
  )
}
