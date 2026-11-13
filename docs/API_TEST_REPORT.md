# API Testing Report — Sufalam Customer Portal

| | |
| --- | --- |
| Date | 13 Nov 2026 |
| System under test | Portal backend (`server/app.ts`) → SAP Business One Service Layer `https://sufalam.connectcloud365.com:57138/b1s/v2` |
| Company database | `TEST_280726` |
| Test accounts | Temporary portal accounts linked to customer `20108` (DADA GURUDEV TRADERS, branch 3) and, for the delivery write test, `20005` |
| Route | HTTP client with cookie jar → `/api/*` → backend → Service Layer, i.e. the same path the browser uses |
| Result | **40 passed, 0 failed, 0 skipped** (`npm run test:api:write`) |

## How the tests were run

`scripts/api-test.ts` starts the **real** backend in-process on a random port with an empty, temporary account
store, then calls the API over HTTP exactly like the browser (session cookie, CSRF header, multipart uploads).
The backend signs in to Service Layer with the configured service user. OTP codes are read from the dev outbox,
so no email is sent. Re-run at any time — no dev server is needed:

```bash
npm run test:api          # security, auth, read APIs, validation — no SAP writes
npm run test:api:write    # also PO draft, delivery acknowledgement, registration lead (all cleaned up)
```

## Results

| ID | Area | Test | Endpoint | Result | Time | Observed |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | Security | Data call without a session is refused | `GET /api/customer` | ✅ Pass | 32 ms | HTTP 401 "Your session has expired. Please sign in again." |
| T02 | Security | POST without the portal CSRF header is blocked | `POST /api/auth/login` | ✅ Pass | 9 ms | HTTP 403 |
| T03 | Auth | Unknown email cannot sign in | `POST /api/auth/login` | ✅ Pass | 75 ms | HTTP 401 "Incorrect email or password." |
| T04 | Auth | Forgot password for an unknown email reveals nothing | `POST /api/auth/password/forgot` | ✅ Pass | 3133 ms | Same generic 200 message; no email sent (includes first SL login) |
| T05 | Auth | Request a password code | `POST /api/auth/password/forgot` | ✅ Pass | 7 ms | 6-digit code emailed |
| T06 | Auth | Second code within a minute is throttled | `POST /api/auth/password/forgot` | ✅ Pass | 4 ms | HTTP 429 |
| T07 | Auth | Weak password is rejected | `POST /api/auth/password/reset` | ✅ Pass | 2 ms | HTTP 400 "Password must be at least 8 characters." |
| T08 | Auth | Wrong code is rejected | `POST /api/auth/password/reset` | ✅ Pass | 2 ms | HTTP 400 |
| T09 | Auth | Correct code sets the password | `POST /api/auth/password/reset` | ✅ Pass | 64 ms | Password set (scrypt hash) |
| T10 | Auth | Used code cannot be reused | `POST /api/auth/password/reset` | ✅ Pass | 3 ms | HTTP 400 "…expired or was already used…" |
| T11 | Auth | Wrong password is rejected | `POST /api/auth/login` | ✅ Pass | 59 ms | HTTP 401 |
| T12 | Auth | Sign in with email + password | `POST /api/auth/login` | ✅ Pass | 88 ms | Customer 20108 loaded; HttpOnly session cookie |
| T13 | Auth | Session survives a reload | `GET /api/auth/me` | ✅ Pass | 2 ms | Signed in as 20108 |
| T14 | Customer | Load customer record | `GET /api/customer` | ✅ Pass | 19 ms | Balance ₹11,046; limit ₹1,50,00,000; price list 1; branch 3; 1 ship-to |
| T15 | Orders | List orders + approval drafts | `GET /api/orders` | ✅ Pass | 151 ms | 1 order (Open) |
| T16 | Create PO | Sellable items with the customer price list | `GET /api/items` | ✅ Pass | 444 ms | 124 items — **0 have a price** (P-03) |
| T17 | Payments | Pending proforma invoices | `GET /api/proformas` | ✅ Pass | 16 ms | 0 open PIs |
| T18 | Payments | Payment history | `GET /api/payments` | ✅ Pass | 53 ms | 7 receipts, all on account (P-05) |
| T19 | Statements | Open invoices + ageing | `GET /api/invoices/open` | ✅ Pass | 15 ms | 1 open, 1 overdue |
| T20 | Statements | Ledger reconciles to the SAP balance | `GET /api/ledger` | ✅ Pass | 6144 ms | 26 rows; closing **= SAP balance ₹11,046** |
| T21 | Statements | Invalid ledger dates are rejected | `GET /api/ledger` | ✅ Pass | 2 ms | HTTP 400 |
| T22 | In-Transit | Open & acknowledged deliveries | `GET /api/deliveries` | ✅ Pass | 16 ms | 0 in transit for 20108 |
| T23 | Security | Cannot acknowledge another customer's delivery | `POST /api/deliveries/7159/ack` | ✅ Pass | 262 ms | HTTP 404 "Delivery 7159 was not found for your account." |
| T24 | Create PO | Ship-to of another customer is rejected | `POST /api/orders` | ✅ Pass | 5 ms | HTTP 400 |
| T25 | Create PO | Non-PDF PO copy is rejected | `POST /api/orders` | ✅ Pass | 5 ms | HTTP 400 (file type checked by content) |
| T26 | Create PO | PO dated today | `POST /api/orders` | ✅ Pass | 1338 ms | Correctly rejected: "SAP has no document numbering series open for 2026-11-13…" (P-01) |
| T27 | Create PO | Submit PO with PDF, dated 28-Sep-2026 | `POST /api/orders` | ✅ Pass | 1495 ms | Draft created on branch 3 with the PDF attached |
| T28 | Create PO | New PO appears in My Orders | `GET /api/orders` | ✅ Pass | 396 ms | "Awaiting approval", terms and 📎 attachment shown |
| T29 | Create PO | Unknown item is rejected | `POST /api/orders` | ✅ Pass | 745 ms | HTTP 404 friendly "no longer exists in SAP" message |
| T30 | Cleanup | Delete test draft | `DELETE Drafts(n)` | ✅ Pass | 106 ms | Deleted |
| T31 | In-Transit | Acknowledge delivery DLN-118103 (as customer 20005) | `POST /api/deliveries/:id/ack` | ✅ Pass | 644 ms | `[Portal ACK 2026-09-28] Received in full — OK — API test` written to Comments |
| T32 | In-Transit | Second acknowledgement is refused | `POST /api/deliveries/:id/ack` | ✅ Pass | 46 ms | HTTP 409 "already acknowledged" |
| T33 | Cleanup | Restore delivery comments | `PATCH DeliveryNotes(n)` | ✅ Pass | 249 ms | Original comments restored |
| T34 | Register | Invalid GSTIN is rejected | `POST /api/register` | ✅ Pass | 9 ms | HTTP 400 |
| T35 | Register | Missing KYC document is rejected | `POST /api/register` | ✅ Pass | 20 ms | HTTP 400 "Please upload the Cancelled Cheque." |
| T36 | Register | Registration creates a SAP lead with KYC files | `POST /api/register` | ✅ Pass | 913 ms | Lead **20197** (inactive), state WB, GSTIN on address, KYC attachment entry 149155 |
| T37 | Register | Same email cannot register twice | `POST /api/register` | ✅ Pass | 4 ms | HTTP 409 |
| T38 | Register | Pending applicant gets "under review", no code | `POST /api/auth/password/forgot` | ✅ Pass | 47 ms | Review notice emailed, no OTP |
| T39 | Cleanup | Delete test lead | `DELETE BusinessPartners('20197')` | ✅ Pass | 2125 ms | Deleted |
| T40 | Auth | Sign out ends the session | `POST /api/auth/logout` | ✅ Pass | 3 ms | Cookie cleared; next call returns 401 |

## Defects found and fixed during testing

| # | Found by | Problem | Fix |
| --- | --- | --- | --- |
| 1 | T36 | Sufalam's `SBO_SP_TRANSACTIONNOTIFICATION` rejects non-numeric BP codes ("not a valid number string"). | Leads are numbered by SAP's automatic BP series (the "Customer" series 4050), so codes are numeric and stay valid after conversion. |
| 2 | T36 | SAP rule "(10005) PLEASE Inactive the BP". | Leads are created inactive (`Valid = tNO`, `Frozen = tYES`); approval = Sufalam converts and activates. |
| 3 | T37 | "A file with this name already exists" when two uploads happened in the same second. | All uploaded files get a unique name with a random suffix. |
| — | earlier (09 Nov) | Branch missing on PO drafts; raw SAP series / ODBC messages | Fixed in the 09 Nov round and re-verified by T26, T27 and T29. |

## Data written to TEST_280726

| What | State after testing |
| --- | --- |
| PO drafts (`NumAtCard` starting `API-TEST-`) | Deleted by the test |
| Delivery DLN-118103 comments | Restored to the original text |
| Lead 20197 | Deleted. Customer series 4050 has moved on to 20198 (each write run uses one number). |
| Attachments2 entries (`PO_20108_API-TEST-*.pdf`, `KYC_19ABCDE1234F1Z5_*`) | Remain — Service Layer cannot delete attachments; harmless test files. |

## Not covered by this report

- **Screen-level (browser) testing.** The API is fully tested; screens were type-checked and built but not clicked through (P-12).
- **Real email delivery** — no SMTP server was available; codes were read from the outbox (P-20).
- **Approval email** — needs a lead converted to a customer in SAP; the check (`approvedCustomer`) runs every 15 minutes.
- **Load / performance.** Timings are single calls; the slowest is the ledger (~6 s for 19 months).
