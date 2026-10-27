import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Brandmark } from '../components/ui'

const steps = ['Company details', 'KYC documents', 'Review & submit']

const kycDocs = [
  { key: 'gst', icon: '📄', label: 'GST Registration Certificate', hint: 'PDF · max 5 MB', required: true },
  { key: 'pan', icon: '🪪', label: 'PAN Card', hint: 'PDF / JPG · max 5 MB', required: true },
  { key: 'cheque', icon: '🏦', label: 'Cancelled Cheque', hint: 'PDF / JPG / PNG · max 5 MB', required: true },
  { key: 'cin', icon: '🏢', label: 'Incorporation Certificate (CIN)', hint: 'PDF · max 5 MB', required: true },
  { key: 'extra', icon: '➕', label: 'Additional attachments', hint: 'Up to 5 files · optional (MSME, TDS declaration, etc.)', required: false },
]

export default function Register() {
  const [step, setStep] = useState(0)
  const [files, setFiles] = useState<Record<string, File[]>>({})
  const [submitted, setSubmitted] = useState(false)

  const missingDocs = kycDocs.filter((d) => d.required && !files[d.key]?.length)

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
              Your application has gone to Sufalam's approving authority. You will receive your login credentials by
              email once approved. <Link to="/login">Back to sign in</Link>
            </p>
          </div>
        ) : (
          <>
            {/* Steps stay mounted (hidden) so entered values survive Back/Continue. */}
            <div hidden={step !== 0}>
              <div className="section-label">Company details</div>
              <div className="grid2">
                <div className="field"><label>Company name *</label><input placeholder="Registered company name" /></div>
                <div className="field">
                  <label>Constitution *</label>
                  <select>
                    <option>Private Limited</option>
                    <option>LLP</option>
                    <option>Partnership</option>
                    <option>Proprietorship</option>
                  </select>
                </div>
                <div className="field"><label>GSTIN *</label><input placeholder="19AABCE1234F1Z6" /></div>
                <div className="field"><label>PAN *</label><input placeholder="AABCE1234F" /></div>
                <div className="field"><label>CIN No. (companies) *</label><input placeholder="U24100WB2015PTC123456" /></div>
                <div className="field"><label>State (auto from GSTIN)</label><input disabled placeholder="—" /></div>
              </div>
              <div className="grid3">
                <div className="field"><label>Contact person *</label><input placeholder="Full name" /></div>
                <div className="field"><label>Mobile *</label><input placeholder="+91" /></div>
                <div className="field"><label>Email (login ID) *</label><input type="email" placeholder="verified by OTP" /></div>
              </div>

              <div className="section-label">Bank details (as per cancelled cheque)</div>
              <div className="grid3">
                <div className="field"><label>Account number *</label><input /></div>
                <div className="field"><label>IFSC *</label><input /></div>
                <div className="field"><label>Bank &amp; branch *</label><input /></div>
              </div>
            </div>

            <div hidden={step !== 1}>
              <div className="section-label">KYC document uploads</div>
              <div className="upload-grid">
                {kycDocs.map((d) => {
                  const picked = files[d.key] ?? []
                  const done = picked.length > 0
                  return (
                    <label key={d.key} className={`upl ${done ? 'done' : ''} ${d.required ? '' : 'wide'}`}>
                      <input
                        type="file"
                        multiple={!d.required}
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => setFiles((f) => ({ ...f, [d.key]: Array.from(e.target.files ?? []) }))}
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
                      {d.required ? (
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
                  Please check your company, bank and KYC details before submitting.{' '}
                  {missingDocs.length > 0 && (
                    <b style={{ color: 'var(--red)' }}>
                      Missing: {missingDocs.map((d) => d.label).join(', ')}.
                    </b>
                  )}
                </p>
              </div>
            )}

            <div className="btn-row" style={{ marginTop: '1.8rem' }}>
              {step > 0 ? (
                <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
                  ← Back
                </button>
              ) : (
                <Link className="btn btn-ghost" to="/login">
                  ← Sign in
                </Link>
              )}
              <span className="spacer" />
              <button className="btn btn-ghost">Save draft</button>
              {step < 2 ? (
                <button className="btn btn-grad" onClick={() => setStep(step + 1)}>
                  {step === 0 ? 'Continue to KYC →' : 'Continue to review →'}
                </button>
              ) : (
                <button className="btn btn-grad" disabled={missingDocs.length > 0} onClick={() => setSubmitted(true)}>
                  Submit application ✓
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
