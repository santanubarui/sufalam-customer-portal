# Handover — Sufalam Customer Portal

React 18 + TypeScript + Vite web portal for Sufalam Industries' customers, with a Node backend connected live to
**SAP Business One Service Layer** (OData v4).
Status as of 13 Nov 2026. Read with [API_TEST_REPORT.md](API_TEST_REPORT.md) and [PENDING_ISSUES.md](PENDING_ISSUES.md).

## 1. Deliverables checklist

| Deliverable | Status | Notes |
| --- | --- | --- |
| Complete updated source code | ✅ Done | This repository. Type-check and build pass. |
| All SAP API integrations | ✅ Done | 40/40 automated API tests pass through the backend (section 5). PO submission needs SAP numbering series for the current date (P-01). |
| Backend (portal accounts, SAP service user) | ✅ Done | `server/`. Customers sign in with email + password; SAP credentials never reach the browser. |
| Login and authentication flow | ✅ Done | Email/password login, HttpOnly session cookie (30-min idle), OTP password reset, first-time activation for existing customers, rate limiting, CSRF header check. |
| Register | ✅ Done | Creates an inactive SAP Lead with GSTIN/PAN/address/contact/bank details + KYC attachments; applicant is emailed when Sufalam approves. |
| Forgot password | ✅ Done | 6-digit email code (10 min, 5 tries, 1/min resend). Needs SMTP configured in production (P-20). |
| UI/UX and branding | ⚠️ Partial | No logo image or favicon yet (P-10). Prototype "UI THEME" bar still visible (P-09). |
| Theme and colour switcher | ❌ Not built | Colours are centralised as CSS variables (P-13). |
| Responsive design | ⚠️ Not device-tested | Breakpoints at 960 px and 640 px (P-12). |
| Error handling | ✅ Done | Every call shows a success or error toast; SAP messages are surfaced; automatic sign-out on session expiry. |
| Tested build | ✅ Done | `npm run build` passes; no SAP settings or credentials in `dist/`; production server smoke-tested. |
| API testing report | ✅ Done | [API_TEST_REPORT.md](API_TEST_REPORT.md) |
| Pending issue report | ✅ Done | [PENDING_ISSUES.md](PENDING_ISSUES.md) |

## 2. Setup

Requirements: Node.js 20.12+ (tested on 22.17), npm, network access to the Service Layer.

```bash
npm install
cp .env.example .env.development.local    # SAP service user (or dev SAP login), test customer
npm run dev                                # http://localhost:5173 — front end + backend
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server on :5173; the `/api` backend runs inside it and reloads when `server/` changes |
| `npm run build` | Type-check + build `dist/` (front end) and `dist-server/index.mjs` (backend) |
| `npm run serve` | Production server on `PORT` (default 8080): `dist/` + `/api` |
| `npm start` | `build` then `serve` |
| `npm run test:api` / `test:api:write` | API tests (section 5) — start their own backend, no dev server needed |
| `npm run portal:user -- <cmd>` | Account admin: `list`, `add <email> <cardCode>`, `disable <email>`, `enable <email>`, `remove <email>` |

### Settings

All settings are listed in `.env.example`. Server-only (never sent to the browser):

| Key | Required | Purpose |
| --- | --- | --- |
| `SAP_SERVICE_USER`, `SAP_SERVICE_PASSWORD` | prod | SAP user the backend signs in with. In dev the `VITE_DEV_SAP_*` login is used if these are empty. |
| `SAP_COMPANY_DB`, `SAP_SL_ORIGIN`, `SAP_TLS_INSECURE` | — | Company DB (`.env` / `.env.production`), SL address, accept SL's internal certificate (default true) |
| `PORTAL_SESSION_SECRET` | prod | ≥ 32 random characters; signs session cookies. Changing it signs everyone out. |
| `PORTAL_PUBLIC_URL` | prod | Portal address used in emails |
| `PORTAL_DATA_DIR` | — | Where portal accounts are stored (`server-data/users.json`). **Back it up.** |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | prod | Outgoing mail. Without `SMTP_HOST` codes are only printed to the server console. |
| `REGISTRATION_NOTIFY_EMAIL` | — | Sufalam mailbox told about each new registration |
| `PORT`, `COOKIE_SECURE`, `PORTAL_SESSION_MINUTES` | — | 8080, true in production (requires HTTPS), 30 |
| `TRUST_PROXY` | behind a proxy | `true` when nginx / IIS sets `X-Forwarded-For` (rate limits per real client address) |

The production server refuses to start without the service user and session secret.

## 3. Code map

```
server/
  index.ts         production entry: static dist/ + /api, security headers, SPA fallback
  app.ts           API routes, session handling, rate limits, approval watcher (every 15 min)
  sl.ts            Service Layer connection: service-user login, re-login on 401, internal certificate
  accounts.ts      portal accounts (users.json), scrypt passwords, signed session tokens, OTP codes
  sapAccounts.ts   customer lookup by email, registration validation, KYC file checks, SAP lead creation
  mail.ts          SMTP (nodemailer) or console outbox
  http.ts          JSON / multipart parsing with size limits, cookies, rate limiter
  env.ts, config.ts  .env loading and settings
src/
  api/client.ts    browser → /api (the only network code in the browser)
  api/portal.ts    SAP ⇄ portal mapping (orders, PO drafts, items, invoices, PIs, payments, deliveries, ledger) — used by the backend
  api/sap.ts       Service Layer HTTP client, error → friendly message, paging
  components/header.tsx  PortalProvider (session, customer, alerts), ProfileMenu, NotificationBell
  pages/           Login, ForgotPassword, Register, Dashboard, CreatePO, Orders, Payments, InTransit, Statements
scripts/
  api-test.ts      API integration tests (real backend + real SAP)
  portal-user.ts   account admin CLI
  build-server.mjs bundles the backend
```

## 4. SAP integration

### Accounts and sign-in
1. **Existing customers** — *Forgot password* with the email stored on their business partner (`EmailAddress`,
   active customer). The backend finds the BP, emails a code, and the customer sets a password. If several BPs share
   the email, or the BP has no email, Sufalam links it with `npm run portal:user -- add <email> <cardCode>` and the
   customer then uses *Forgot password*.
2. **Sign-in** — email + password → the backend checks the password, loads `BusinessPartners('<code>')` (must still be
   an active customer) and sets an HttpOnly cookie. 30 minutes idle → signed out. 8 failed attempts → 15-minute lock.
3. **Every data call** uses the CardCode stored with the account. Deliveries are re-read and ownership-checked before
   acknowledgement; ship-to codes are checked against the customer's own addresses.
4. Disabling an account or resetting a password ends that account's open sessions.

### New customer registration → approval
1. The applicant fills in company, GSTIN, PAN, CIN/LLPIN, address, contact, bank details and uploads KYC files
   (PDF/JPG/PNG, ≤ 5 MB each, file type checked).
2. The backend uploads the files to `Attachments2` and creates a **Lead** (`CardType cLid`) — inactive (Sufalam rule
   10005), with bill-to/ship-to address (state from GSTIN, GSTIN, GST type), PAN, contact person, and the rest in
   Remarks (`FreeText`). The code comes from SAP's automatic BP series (currently the "Customer" series 4050, e.g.
   20197) because Sufalam's transaction notification requires numeric codes.
3. Sufalam reviews the lead in SAP, **converts it to a customer and makes it active** (and assigns price list,
   branch, etc.).
4. Every 15 minutes (and whenever the applicant uses *Forgot password*) the backend checks pending applications;
   once approved, the applicant is emailed a link to set a password.

### Screen → Service Layer

| Screen | Reads | Writes |
| --- | --- | --- |
| Dashboard | BusinessPartners, Orders, Drafts, Invoices, IncomingPayments, DownPayments, DeliveryNotes | — |
| Create PO | BusinessPartners (price list, branch, ship-to), Items (`ItemPrices`) | `POST Attachments2` (PO PDF), `POST Drafts` with `DocObjectCode: oOrders`, customer's branch, ship-to, line ship dates |
| My Orders | Orders + open order Drafts (= "Awaiting approval") | — |
| PI & Payments | DownPayments (`dptRequest`, open), IncomingPayments | — |
| In-Transit | DeliveryNotes (open / acknowledged) | `PATCH DeliveryNotes(n)` — `[Portal ACK date] condition — remarks` in Comments; optional photo via Attachments2 |
| Statements | Invoices, DownPayments (`dptInvoice`), CreditNotes, IncomingPayments | — (CSV export / print) |
| Register | BusinessPartners (email check) | `POST Attachments2` (KYC), `POST BusinessPartners` (lead) |

Sufalam-specific SAP rules the portal relies on:
- **Branches** are enabled (1 Sufalam Industries, 3 Agri Division, 4 Bottling). Documents use the customer's branch from `BPBranchAssignment`.
- **Numbering series** for sales documents are per day and per branch; a series must exist for the PO date (P-01).
  The draft is posted with an explicit `Series`: the unlocked, automatic SO series (document 17) of the customer's
  branch whose period indicator matches the posting period of the PO date (fallback: a series whose name/remarks
  contain the date). The series list is cached for 5 minutes and re-read when no series matches.
- **Business partners** must have numeric codes and be created inactive (`SBO_SP_TRANSACTIONNOTIFICATION`).
- **PO approval**: the portal creates a *draft* sales order; Sufalam adds it as a Sales Order in SAP.
- Uploaded files get unique names (`PO_<card>_<po>_<stamp>.pdf`, `ACK_…`, `KYC_<gstin>_…`) because SAP rejects a file name that already exists in the attachments folder.

### Error handling

| Situation | Message shown |
| --- | --- |
| Wrong email / password | "Incorrect email or password." (same for unknown, pending and disabled accounts) |
| Session expired (401) | "Session expired" toast + automatic sign-out |
| Backend can't sign in to SAP | "The portal could not connect to SAP. Please try again later or contact Sufalam." (details in the server log) |
| SAP unreachable | "SAP Service Layer is not reachable right now. Please try again shortly." |
| SAP business error (400) | SAP's own message, e.g. credit limit or validation |
| No numbering series for date | "SAP has no document numbering series open for <date>…" |
| Invalid input | Field-specific message (GSTIN, PAN, dates, quantities, file type/size…) |

## 5. Testing

`npm run test:api` starts the real backend in-process with a temporary account store, calls `/api` over HTTP and
reaches the real Service Layer. `npm run test:api:write` also creates and cleans up a PO draft, a delivery
acknowledgement and a registration lead. See [API_TEST_REPORT.md](API_TEST_REPORT.md).

- The write test uses PO date **2026-09-28** (`SERIES_DATE` in `scripts/api-test.ts`); update once P-01 is fixed.
- Each write run uses one number from the customer BP series in the test DB (the test lead is deleted afterwards).
- Tests must run **without SMTP configured** — OTP codes are read from the console outbox.
- No browser/UI automated tests exist yet (P-12).

## 6. Production deployment

1. On the server: `npm ci && npm run build`.
2. Create `.env.production.local` (or real environment variables) from `.env.example`: service user, session
   secret, public URL, SMTP.
3. Run `npm run serve` under a process manager (systemd, pm2, NSSM on Windows) and keep `server-data/` backed up.
4. Put HTTPS in front (nginx / IIS / load balancer) and forward everything to the Node server. `/b1s` no longer
   needs to be exposed. Example for nginx:

```nginx
server {
  listen 443 ssl;
  server_name portal.sufalam.example;
  client_max_body_size 40m;                 # registration uploads

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}
```

## 7. Credentials and access

- Create a dedicated SAP **service user** with only the objects listed in `.env.example`. Do **not** use `manager`
  (a superuser, whose password was shared in screenshots during development — change it).
- `PORTAL_SESSION_SECRET`, the service user password and SMTP password live only on the server (`*.local` is gitignored).
- `server-data/users.json` holds portal accounts with scrypt password hashes; it is gitignored and must be backed up.
