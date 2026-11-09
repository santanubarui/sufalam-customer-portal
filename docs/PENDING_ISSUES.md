# Pending Issues — Sufalam Customer Portal

Status as of 09 Nov 2026. Severity: **High** = blocks go-live, **Medium** = should fix before go-live, **Low** = improvement.

## Blocking go-live

| ID | Severity | Area | Issue | Who | Action |
| --- | --- | --- | --- | --- | --- |
| P-01 | High | SAP config | Sales Order numbering series exist only **up to 30-Sep-2026** (one series per day per branch). No PO can be submitted for any later date — from the portal or from the SAP client. | Sufalam SAP admin | Create daily SO series for Oct-2026 onward for branches 1, 3 and 4 (and keep them ahead of the calendar). |
| P-02 | High | Security | Sign-in uses an **SAP user name and password** typed into the browser (testing used `manager`, a superuser). Every customer would need an SAP user, and SAP credentials pass through the browser. | Development | Add a small backend: the customer signs in with portal credentials; the backend logs into Service Layer with a restricted service user and only returns that customer's data. |
| P-03 | High | SAP data | No item has a price on any of the 10 price lists in `TEST_280726`, and there are no special prices. Create PO shows "on request" and a ₹0 total. | Sufalam | Maintain prices in the customer price lists (or confirm the pricing source, e.g. special prices / period discounts). |
| P-04 | High | Hosting | The portal calls `/b1s` on its own address. The Vite proxy does this only in `npm run dev` / `npm run preview`. | IT / Development | In production, configure the web server (nginx / IIS) to reverse-proxy `/b1s` → `https://sufalam.connectcloud365.com:57138/b1s` over HTTPS (see HANDOVER.md). |

## Should fix before go-live

| ID | Severity | Area | Issue | Action |
| --- | --- | --- | --- | --- |
| P-05 | Medium | Statements / Dashboard | "Advances" counts every incoming payment with no linked invoice. For customer 20108 that is ₹1.6 crore of receipts against an ₹11,046 balance — they were probably settled later by internal reconciliation, which Service Layer doesn't expose. | Agree a rule with Sufalam accounts (e.g. a UDF, or a saved SQL query on reconciliations) and change `getPayments` accordingly. |
| P-06 | Medium | Payments | **Pay now** only shows bank-transfer instructions; no payment gateway is connected. | Choose a gateway (Razorpay, etc.); post successful payments as `IncomingPayments`. |
| P-07 | Medium | Register | Registration form is front-end only; nothing is saved to SAP. | Backend endpoint to create a Lead business partner (`CardType: cLid`) + KYC attachments, plus an approval flow. |
| P-08 | Medium | Forgot password | OTP / reset screens are front-end only. Service Layer has no password-reset API. | Implement together with P-02 (portal-owned customer accounts). |
| P-09 | Medium | UI | The dark **"UI THEME" bar** at the top (prototype screen switcher) is still shown after sign-in. | Remove `ThemeBar` from `src/App.tsx` before go-live. |
| P-10 | Medium | Branding | No logo image or favicon — the brand mark is a styled letter "S". | Provide the Sufalam logo (SVG/PNG); add it to `public/` and the `Brandmark` component and favicon. |
| P-11 | Medium | Dependencies | `npm audit`: react-router-dom (moderate — open-redirect advisories) and vite/esbuild (dev-server only). Fixes need major upgrades (react-router 7, vite 8). | Upgrade and retest. |
| P-12 | Medium | Testing | Screens were not tested in a browser or on mobile devices; only the API layer has automated tests. | Manual UAT on Chrome, Edge, Safari and a phone; check layouts at 360 px, 768 px, 1280 px. |

## Requested but not built

| ID | Severity | Item | Status |
| --- | --- | --- | --- |
| P-13 | Low | **Theme / colour switcher** | Not implemented. Colours are CSS variables in `src/styles/theme.css` (`:root`), so a light/dark or brand-colour switcher can be added by swapping those variables. |

## Known limitations (by design, can be improved)

| ID | Area | Limitation |
| --- | --- | --- |
| P-14 | In-Transit | Acknowledgement is written into the delivery's **Comments** field (`[Portal ACK yyyy-mm-dd] …`, max 254 chars). A dedicated UDF would be cleaner. |
| P-15 | Statements | Ledger is built from invoices, down-payment invoices, credit memos and receipts. Manual journal entries and outgoing refunds are not shown (Service Layer can't query JE lines per customer). The closing balance still matches SAP. |
| P-16 | Documents | SAP document numbers repeat across branches (e.g. two deliveries numbered 118103). The portal shows the number only; add branch to the label if customers buy from several branches. |
| P-17 | Create PO | GST shown is a fixed 18% estimate; SAP applies the real tax codes on approval. Item list is capped at 500 items. |
| P-18 | Export | "Export PDF" uses the browser print dialog; "Export Excel" downloads CSV. |
| P-19 | Items | Some items have no name in SAP (e.g. item `4147`), so the portal shows the item code. |
