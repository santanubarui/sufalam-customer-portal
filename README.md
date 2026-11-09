# sufalam-customer-portal

React + Vite customer portal connected live to SAP Business One Service Layer (OData v4, `/b1s/v2`).

Docs: [Handover](docs/HANDOVER.md) · [API test report](docs/API_TEST_REPORT.md) · [Pending issues](docs/PENDING_ISSUES.md)

## Setup

```bash
npm install
cp .env.example .env.development.local   # fill in dev SAP login (optional, pre-fills sign-in)
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:5173 (opens browser, hot reload, SAP proxy) |
| `npm run build` | Type-check + production build into `dist/` |
| `npm run preview` | Serve the built `dist/` on http://localhost:4173 (with SAP proxy) |
| `npm start` | `build` then `preview` in one go |
| `npm run typecheck` | TypeScript check only |
| `npm run clean` | Delete `dist/` |
| `npm run test:api` | API integration tests against SAP (needs `npm run dev`); `test:api:write` also tests writes |

## Environment files

| File | Mode | In git | Contents |
| --- | --- | --- | --- |
| `.env` | all | yes | `SAP_SL_ORIGIN`, `VITE_SAP_BASE_URL`, `VITE_SAP_COMPANY_DB` |
| `.env.production` | build | yes | production overrides (no secrets) |
| `.env.development.local` | dev | **no** | `VITE_DEV_SAP_USER`, `VITE_DEV_SAP_PASSWORD`, `VITE_DEV_CARD_CODE` |
| `.env.example` | — | yes | template for the file above |

Escape `$` as `\$` in env values (Vite expands `$VAR`). Dev credentials are never included in `npm run build`.

Sign in with **customer code** (SAP CardCode, e.g. `20108`), SAP user name, password and company DB.

## How it talks to SAP

The browser calls `/b1s/v2/...` on its own origin; the Vite dev/preview proxy forwards to `SAP_SL_ORIGIN`.
This avoids CORS and keeps the `B1SESSION` / `ROUTEID` cookies first-party. **For production, put the same
reverse proxy (`/b1s` → Service Layer) in front of the built `dist/` (nginx, IIS, etc.).**

| Screen | Service Layer |
| --- | --- |
| Sign in / out | `POST Login`, `POST Logout`, `GET BusinessPartners('<code>')` |
| Dashboard | Orders, Drafts, Invoices, IncomingPayments, DownPayments, DeliveryNotes |
| Create PO | `GET Items` (BP price list), `POST Attachments2` (PO PDF), `POST Drafts` (`DocObjectCode: oOrders`) |
| My Orders | `GET Orders` + open order `Drafts` (= awaiting approval) |
| PI & Payments | `GET DownPayments` (open requests), `GET IncomingPayments` |
| In-Transit | `GET DeliveryNotes`; acknowledgement → `PATCH DeliveryNotes(n)` (stamps `[Portal ACK yyyy-mm-dd]` in Comments) |
| Statements | Invoices, DownPayments (invoices), CreditNotes, IncomingPayments; opening balance derived from the live BP balance |

Every call shows a success or error toast; SAP error messages are surfaced as returned by Service Layer.
A 401 from any call (30-min SL session timeout) signs the user out.

Code: `src/api/sap.ts` (HTTP client, errors, paging) and `src/api/portal.ts` (SAP → portal mapping).
