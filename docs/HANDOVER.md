# Handover — Sufalam Customer Portal

React 18 + TypeScript + Vite web portal for Sufalam Industries' customers, connected live to **SAP Business One Service Layer** (OData v4).
Status as of 09 Nov 2026. Read with [API_TEST_REPORT.md](API_TEST_REPORT.md) and [PENDING_ISSUES.md](PENDING_ISSUES.md).

## 1. Deliverables checklist

| Deliverable | Status | Notes |
| --- | --- | --- |
| Complete updated source code | ✅ Done | This repository. Type-check and build pass. |
| All SAP API integrations | ✅ Done | 24/24 automated API tests pass (section 5). PO submission needs SAP numbering series for the current date (P-01). |
| Login and authentication flow | ⚠️ Works, not production-safe | SAP login / logout / session expiry / route guard all work. Uses SAP user credentials in the browser — needs a backend before go-live (P-02). Register and Forgot password are front-end only (P-07, P-08). |
| UI/UX and branding | ⚠️ Partial | Brand colours (green / purple), fonts and layout are in place. No logo image or favicon yet (P-10). Prototype "UI THEME" bar still visible (P-09). |
| Theme and colour switcher | ❌ Not built | Colours are centralised as CSS variables, so it can be added (P-13). |
| Logo and button styling | ⚠️ Partial | Button styles done (primary, gradient, ghost, purple, small, disabled). Logo is a styled "S" placeholder (P-10). |
| Responsive design | ⚠️ Not device-tested | Breakpoints at 960 px (sidebar becomes a drawer) and 640 px; tables scroll horizontally. Needs real-device testing (P-12). |
| Error handling | ✅ Done | Every SAP call shows a success or error toast; inline form errors; loading and retry states; automatic sign-out on session expiry. |
| Tested build | ✅ Done | `npm run build` passes; no credentials in `dist/`; `npm run preview` tested against SAP. |
| API testing report | ✅ Done | [API_TEST_REPORT.md](API_TEST_REPORT.md) |
| Pending issue report | ✅ Done | [PENDING_ISSUES.md](PENDING_ISSUES.md) |
| Final handover documentation | ✅ Done | This file. |

## 2. Setup

Requirements: Node.js 20+ (tested on 22.17), npm, network access to the Service Layer.

```bash
npm install
cp .env.example .env.development.local    # fill in dev SAP login (optional; pre-fills the sign-in form)
npm run dev                                # http://localhost:5173
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server on :5173 with hot reload and the SAP proxy |
| `npm run build` | Type-check + production build into `dist/` |
| `npm run preview` | Serve `dist/` on :4173 with the SAP proxy |
| `npm start` | `build` then `preview` |
| `npm run typecheck` | TypeScript check only |
| `npm run clean` | Delete `dist/` |
| `npm run test:api` | API tests, read-only (needs `npm run dev` running) |
| `npm run test:api:write` | API tests including create/delete of a test PO draft |

### Environment files

| File | Used by | In git | Keys |
| --- | --- | --- | --- |
| `.env` | all modes | yes | `SAP_SL_ORIGIN` (proxy target, server-side only), `VITE_SAP_BASE_URL` (`/b1s/v2`), `VITE_SAP_COMPANY_DB` |
| `.env.production` | `npm run build` | yes | production overrides — no secrets |
| `.env.development.local` | `npm run dev` | **no** | `VITE_DEV_SAP_USER`, `VITE_DEV_SAP_PASSWORD`, `VITE_DEV_CARD_CODE` |
| `.env.example` | — | yes | template for the file above |

Escape `$` as `\$` in env values (Vite expands `$VAR`). Dev credentials are never included in production builds (verified).

## 3. Code map

```
src/
  api/sap.ts          HTTP client: request, error → friendly message, paging (@odata.nextLink), Login/Logout, session-expiry hook
  api/portal.ts       SAP ⇄ portal mapping: customer, orders, PO drafts, items, invoices, PIs, payments, deliveries, ledger
  hooks/useAsync.ts   load data with loading / error / reload; aborts stale requests
  components/
    header.tsx        PortalProvider (session, customer, alerts), ProfileMenu, NotificationBell, useSignOut
    AppLayout.tsx     signed-in shell + route guard, sidebar, header, Topbar
    toast.tsx         success / error / info toasts
    ui.tsx            Card, Tile, Tag, DateChip, Loading, ErrorState, Async, EmptyRow, PublicLayout
  pages/              Login, Dashboard, CreatePO, Orders, Payments, InTransit, Statements, Register*, ForgotPassword*
  styles/theme.css    all styling; brand colours are CSS variables in :root
scripts/
  api-test.ts         API integration tests (imports src/api directly)
  run-api-test.mjs    bundles and runs the tests with env from .env.development.local
vite.config.ts        /b1s proxy to Service Layer (dev + preview)
```
\* front-end only — see P-07, P-08.

## 4. SAP integration

### Authentication flow
1. User enters customer code, SAP user, password, company DB → `POST /Login`.
2. Portal loads `GET /BusinessPartners('<code>')`; if it isn't a customer or doesn't exist, the session is logged out and an error is shown.
3. Session is kept in SL cookies (`B1SESSION`, `ROUTEID`); the portal stores only the customer code in `sessionStorage`, so a page reload restores the session.
4. Any HTTP 401 (SL timeout is 30 min) signs the user out with "Session expired". Sign-out calls `POST /Logout`.

### Screen → Service Layer

| Screen | Reads | Writes |
| --- | --- | --- |
| Dashboard | BusinessPartners, Orders, Drafts, Invoices, IncomingPayments, DownPayments, DeliveryNotes | — |
| Create PO | BusinessPartners (price list, branch, ship-to), Items (`ItemPrices`) | `POST Attachments2` (PO PDF), `POST Drafts` with `DocObjectCode: oOrders`, customer's branch, ship-to, line ship dates |
| My Orders | Orders + open order Drafts (= "Awaiting approval") | — |
| PI & Payments | DownPayments (`dptRequest`, open), IncomingPayments | — |
| In-Transit | DeliveryNotes (open / acknowledged) | `PATCH DeliveryNotes(n)` — stamps `[Portal ACK date] condition — remarks` in Comments; optional photo via Attachments2 |
| Statements | Invoices, DownPayments (`dptInvoice`), CreditNotes, IncomingPayments | — (CSV export / print) |

Sufalam-specific SAP rules the portal relies on:
- **Branches** are enabled (1 Sufalam Industries, 3 Agri Division, 4 Bottling). Documents use the customer's branch from `BPBranchAssignment`.
- **Numbering series** are per day and per branch. SAP chooses the series automatically from the document date and branch, so a series must exist for that date (P-01).
- **PO approval**: the portal creates a *draft* sales order. Sufalam reviews it in SAP and adds it as a Sales Order; the confirmed delivery date (`DocDueDate`) then appears in My Orders.

### Error handling
All calls go through `sapRequest` in `src/api/sap.ts`:

| Situation | Message shown |
| --- | --- |
| Wrong login | "Sign-in failed: invalid company database, user name or password." |
| Session expired (401) | "Your SAP session has expired. Please sign in again." + automatic sign-out |
| Network down / proxy unreachable | "Cannot reach SAP Service Layer…" / "SAP Service Layer is not reachable right now…" (502–504) |
| SAP business error (400) | SAP's own message, e.g. credit limit or validation |
| No numbering series for date | "SAP has no document numbering series open for <date>…" |
| Unknown customer / item | "Customer code … was not found" / "…no longer exists in SAP…" |

Pages show a spinner while loading and an error box with **Retry** on failure. Write actions show a toast for success and for failure.

## 5. Testing

- `npm run test:api` / `npm run test:api:write`: see [API_TEST_REPORT.md](API_TEST_REPORT.md). The write test submits a PO dated **2026-09-28** (`SERIES_DATE` in `scripts/api-test.ts`) because that is the last range with open series in `TEST_280726`; update it once P-01 is fixed.
- No browser/UI automated tests exist yet (P-12).

## 6. Production deployment

1. `npm run build` → upload `dist/` to the web server.
2. Serve `index.html` for all routes (single-page app).
3. Reverse-proxy `/b1s` to Service Layer **over HTTPS** (keeps SAP cookies first-party and avoids CORS). Example for nginx:

```nginx
server {
  listen 443 ssl;
  server_name portal.sufalam.example;
  root /var/www/sufalam-portal/dist;

  location / { try_files $uri /index.html; }

  location /b1s/ {
    proxy_pass https://sufalam.connectcloud365.com:57138/b1s/;
    proxy_ssl_verify off;            # SL often uses an internal certificate
    proxy_cookie_domain ~.* $host;
    proxy_set_header Host sufalam.connectcloud365.com:57138;
  }
}
```

4. Before go-live, complete the High items in [PENDING_ISSUES.md](PENDING_ISSUES.md), especially **P-02** (move SAP credentials to a backend).

## 7. Credentials and access

- Development used SAP user `manager` on `TEST_280726`. This is a superuser account. **Do not use it for customers**, and change its password because it was shared in screenshots during development.
- `.env.development.local` holds the dev password and must never be committed (`*.local` is gitignored).
