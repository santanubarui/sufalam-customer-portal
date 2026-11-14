# Pending Issues — Sufalam Customer Portal

Status as of 13 Nov 2026. Severity: **High** = blocks go-live, **Medium** = should fix before go-live, **Low** = improvement.

## Resolved on 13 Nov 2026

| ID | Was | Resolution |
| --- | --- | --- |
| P-02 | Sign-in used SAP user name + password in the browser | Portal backend (`server/`): customers sign in with email + portal password; the backend uses one SAP service user and scopes every call to the customer's CardCode. |
| P-04 | Production needed a `/b1s` reverse proxy | The Node server (`npm run serve`) serves the app and `/api`; only HTTPS needs to be put in front. |
| P-07 | Registration was front-end only | `POST /api/register` creates an inactive SAP Lead with KYC attachments; applicant is emailed after Sufalam converts and activates it. |
| P-08 | OTP / reset screens were front-end only | Email OTP reset and first-time activation implemented (`/api/auth/password/*`). |

## Blocking go-live

| ID | Severity | Area | Issue | Who | Action |
| --- | --- | --- | --- | --- | --- |
| P-01 | High | SAP config | Sales Order numbering series exist only **up to 30-Sep-2026** (one series per day per branch). No PO can be submitted for any later date — from the portal or from the SAP client. | Sufalam SAP admin | Create daily SO series for Oct-2026 onward for branches 1, 3 and 4 (and keep them ahead of the calendar). |
| P-03 | High | SAP data | No item has a price on any of the 10 price lists in `TEST_280726`, and there are no special prices. Sufalam confirmed customer-wise price lists are not maintained. **Workaround in place:** for items with no price, Create PO asks the customer for a manual rate, sent to the SAP draft as `UnitPrice` with the line remark "Manual rate entered by customer". Items that do have a price keep the SAP rate (the server ignores any client rate for them). | Sufalam | Check manual rates when approving drafts. Maintain price lists later if they want fixed rates. |
| P-20 | High | Email | OTP codes and registration notices need an SMTP mailbox. Without `SMTP_HOST`, codes are only printed in the server log, so customers can't set passwords. | Sufalam IT | Provide SMTP host / user / password and a sender address (e.g. `portal@sufalam…`); set them in `.env.production.local`. |
| P-21 | High | SAP security | The backend needs its own SAP **service user** (development used `manager`). | Sufalam SAP admin | Create a user limited to the objects listed in `.env.example`; set `SAP_SERVICE_USER` / `SAP_SERVICE_PASSWORD`. Change the `manager` password. |
| P-22 | High | Hosting | The portal server must run behind HTTPS with a process manager and backups of `server-data/`. | IT | See HANDOVER §6. Set `PORTAL_SESSION_SECRET`, `PORTAL_PUBLIC_URL`, `TRUST_PROXY=true`. |

## Should fix before go-live

| ID | Severity | Area | Issue | Action |
| --- | --- | --- | --- | --- |
| P-05 | Medium | Statements / Dashboard | "Advances" counts every incoming payment with no linked invoice. For customer 20108 that is ₹1.6 crore of receipts against an ₹11,046 balance — probably settled later by internal reconciliation, which Service Layer doesn't expose. | Agree a rule with Sufalam accounts (e.g. a UDF, or a saved SQL query on reconciliations) and change `getPayments` accordingly. |
| P-06 | Medium | Payments | **Pay now** only shows bank-transfer instructions; no payment gateway is connected. | Choose a gateway (Razorpay, etc.); post successful payments as `IncomingPayments` from the backend. |
| P-09 | Medium | UI | The dark **"UI THEME" bar** at the top (prototype screen switcher) is still shown after sign-in. | Remove `ThemeBar` from `src/App.tsx` before go-live. |
| P-10 | Medium | Branding | No logo image or favicon — the brand mark is a styled letter "S". | Provide the Sufalam logo; add it to `public/`, the `Brandmark` component and favicon. |
| P-11 | Medium | Dependencies | `npm audit`: react-router-dom (moderate — open-redirect advisories) and vite/esbuild (dev-server only). Fixes need major upgrades (react-router 7, vite 8). | Upgrade and retest. |
| P-12 | Medium | Testing | Screens were not tested in a browser or on mobile devices; the API layer has automated tests. | Manual UAT on Chrome, Edge, Safari and a phone (360 / 768 / 1280 px), including Register and Forgot password. |
| P-23 | Medium | Customer emails | First-time sign-in works only for customers whose SAP business partner has a unique `EmailAddress`. | Fill in customer emails in SAP, or link accounts with `npm run portal:user -- add <email> <cardCode>`. |
| P-24 | Medium | Approval process | Registrations arrive as inactive leads (numbered from the Customer series). | Sufalam to agree who reviews leads and to **convert + activate** approved ones in SAP (that triggers the applicant's email). Set `REGISTRATION_NOTIFY_EMAIL`. |

## Requested but not built

| ID | Severity | Item | Status |
| --- | --- | --- | --- |
| P-13 | Low | **Theme / colour switcher** | Not implemented. Colours are CSS variables in `src/styles/theme.css` (`:root`). |
| P-25 | Low | Email verification at registration | The email is verified when the approved applicant sets a password (OTP), not at submission. |

## Known limitations (by design, can be improved)

| ID | Area | Limitation |
| --- | --- | --- |
| P-14 | In-Transit | Acknowledgement is written into the delivery's **Comments** field (`[Portal ACK yyyy-mm-dd] …`, max 254 chars). A dedicated UDF would be cleaner. |
| P-15 | Statements | Ledger is built from invoices, down-payment invoices, credit memos and receipts. Manual journal entries and outgoing refunds are not shown. The closing balance still matches SAP. |
| P-16 | Documents | SAP document numbers repeat across branches. The portal shows the number only. |
| P-17 | Create PO | GST shown is a fixed 18% estimate; SAP applies the real tax codes on approval. Item list is capped at 500 items. |
| P-18 | Export | "Export PDF" uses the browser print dialog; "Export Excel" downloads CSV. |
| P-19 | Items | Some items have no name in SAP (e.g. item `4147`), so the portal shows the item code. |
| P-26 | Accounts | One login email per customer account; portal accounts are stored in a JSON file (fine for hundreds of customers — move to a database if many users per customer are needed). Rate limits and OTP codes are in memory and reset when the server restarts. |
| P-27 | Bank details | Registration bank details are stored in the lead's Remarks, not as BP bank accounts (needs Sufalam's bank master codes). |
