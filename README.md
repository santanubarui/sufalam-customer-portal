# sufalam-customer-portal

Customer portal for Sufalam Industries: React + Vite front end and a small Node backend connected live to
SAP Business One Service Layer (OData v4, `/b1s/v2`).

Docs: [Handover](docs/HANDOVER.md) · [API test report](docs/API_TEST_REPORT.md) · [Pending issues](docs/PENDING_ISSUES.md)

## Setup

Node.js 20.12+ (tested on 22.17).

```bash
npm install
cp .env.example .env.development.local   # fill in the SAP service user (or the dev SAP login)
npm run dev                              # http://localhost:5173 — front end + /api backend in one process
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:5173 with hot reload; the `/api` backend runs inside it |
| `npm run build` | Type-check, build the front end into `dist/` and the backend into `dist-server/` |
| `npm run serve` | Production server: serves `dist/` and `/api` on `PORT` (default 8080) |
| `npm start` | `build` then `serve` |
| `npm run typecheck` | TypeScript check only (front end + server) |
| `npm run clean` | Delete `dist/` and `dist-server/` |
| `npm run test:api` | API tests through the real backend against SAP (no dev server needed); `test:api:write` also tests writes |
| `npm run portal:user -- list` | Portal account admin: `list`, `add <email> <cardCode>`, `disable`, `enable`, `remove <email>` |

## How it works

```
Browser ──/api (HttpOnly session cookie)──▶ Portal backend (server/) ──service user──▶ SAP Service Layer
```

- Customers sign in with their **email and portal password**. They never see or need an SAP user.
- The backend signs in to Service Layer with one restricted **service user** and scopes every request to the
  signed-in customer's CardCode (taken from the session, never from the browser).
- **First sign-in**: an existing customer enters the email held on their SAP business partner under
  *Forgot password*, receives a 6-digit code and sets a password.
- **New customers** register on the portal → an inactive **Lead** is created in SAP with the KYC files attached →
  when Sufalam converts it to an active customer, the applicant is emailed a link to set a password.

| Screen | API | Service Layer |
| --- | --- | --- |
| Sign in / out | `POST /api/auth/login`, `/logout`, `GET /api/auth/me` | `BusinessPartners('<code>')` |
| Forgot password / first sign-in | `POST /api/auth/password/forgot`, `/reset` | `BusinessPartners` (lookup by email) |
| Register | `POST /api/register` | `POST Attachments2`, `POST BusinessPartners` (lead) |
| Dashboard | `/api/customer`, `/orders`, `/invoices/open`, `/payments` | Orders, Drafts, Invoices, IncomingPayments |
| Create PO | `GET /api/items`, `POST /api/orders` | Items, `POST Attachments2`, `POST Drafts` (`oOrders`) |
| My Orders | `GET /api/orders` | Orders + open order Drafts |
| PI & Payments | `GET /api/proformas`, `/payments` | DownPayments (requests), IncomingPayments |
| In-Transit | `GET /api/deliveries`, `POST /api/deliveries/:id/ack` | DeliveryNotes (`PATCH` Comments), Attachments2 |
| Statements | `GET /api/ledger`, `/invoices/open`, `/payments` | Invoices, DownPayments, CreditNotes, IncomingPayments |

Code: `server/` (backend), `src/api/client.ts` (browser → `/api`), `src/api/portal.ts` (SAP ⇄ portal mapping,
used by the backend), `src/api/sap.ts` (Service Layer HTTP client).

## Environment files

| File | Used by | In git | Contents |
| --- | --- | --- | --- |
| `.env` | all | yes | `SAP_SL_ORIGIN`, company DB |
| `.env.production` | `npm run serve` | yes | production overrides (no secrets) |
| `.env.development.local` | dev + tests | **no** | service user / dev SAP login, test customer |
| `.env.production.local` | `npm run serve` | **no** | `SAP_SERVICE_USER`, `SAP_SERVICE_PASSWORD`, `PORTAL_SESSION_SECRET`, SMTP |
| `.env.example` | — | yes | template with every setting |

Escape `$` as `\$` in env values. No SAP setting is included in the browser bundle.
