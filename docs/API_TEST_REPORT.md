# API Testing Report — Sufalam Customer Portal

| | |
| --- | --- |
| Date | 09 Nov 2026 |
| System under test | SAP Business One Service Layer `https://sufalam.connectcloud365.com:57138/b1s/v2` (SL version 1000270) |
| Company database | `TEST_280726` |
| SAP user / test customer | `manager` / `20108` (DADA GURUDEV TRADERS, branch 3) |
| Route | Portal code → Vite dev proxy (`/b1s`) → Service Layer, i.e. the same path the browser uses |
| Result | **24 passed, 0 failed, 0 skipped** |

## How the tests were run

The test suite (`scripts/api-test.ts`) imports the portal's **real** API code (`src/api/sap.ts`, `src/api/portal.ts`) and calls it the same way the
screens do, with a cookie jar that mimics the browser session. Re-run it at any time:

```bash
npm run dev               # terminal 1
npm run test:api          # terminal 2 — read-only + error handling (safe on any DB)
npm run test:api:write    # also exercises the write APIs (see "Data written" below)
```

## Results

| ID | Area | Test | Endpoint | Result | Time | Observed |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | Auth | Login with wrong password is rejected | `POST Login` | ✅ Pass | 2500 ms | HTTP 401 → "Sign-in failed: invalid company database, user name or password." |
| T02 | Auth | Login with wrong company DB is rejected | `POST Login` | ✅ Pass | 1422 ms | HTTP 401 → same friendly message |
| T03 | Auth | Data call without a session | `GET Orders` | ✅ Pass | 592 ms | HTTP 401 → "Your SAP session has expired. Please sign in again."; portal sign-out triggered |
| T04 | Auth | Login with valid credentials | `POST Login` | ✅ Pass | 2578 ms | Session created; `B1SESSION` + `ROUTEID` cookies received through the proxy; 30-min timeout |
| T05 | Auth | Unknown customer code | `GET BusinessPartners(code)` | ✅ Pass | 1387 ms | HTTP 404 → "Customer code "NO_SUCH_CUST" was not found in SAP." |
| T06 | Customer | Load customer record | `GET BusinessPartners(20108)` | ✅ Pass | 634 ms | Name, balance ₹11,046, limit ₹1,50,00,000, available credit, price list 1, branch 3, 1 ship-to |
| T07 | Orders | List orders + approval drafts | `GET Orders`, `GET Drafts` | ✅ Pass | 664 ms | 1 order (Open) |
| T08 | Create PO | Load sellable items with price list | `GET Items` | ✅ Pass | 1566 ms | 124 items — **0 have a price** (see issue P-03) |
| T09 | Payments | Pending proforma invoices | `GET DownPayments` | ✅ Pass | 64 ms | 0 open PIs |
| T10 | Payments | Payment history | `GET IncomingPayments` | ✅ Pass | 97 ms | 7 receipts, all on account (see issue P-05) |
| T11 | Statements | Open invoices + ageing | `GET Invoices` | ✅ Pass | 57 ms | 1 open, 1 overdue |
| T12 | Statements | Ledger 01-Apr-2025 → today | Invoices, DownPayments, CreditNotes, IncomingPayments | ✅ Pass | 5643 ms | 26 rows; closing balance **equals SAP balance (₹11,046)** |
| T13 | In-Transit | Open & acknowledged deliveries | `GET DeliveryNotes` | ✅ Pass | 73 ms | 0 in transit for this customer |
| T14 | Errors | Invalid query surfaces SAP message | `GET Orders?$filter=…` | ✅ Pass | 76 ms | HTTP 400 → SAP's own message shown |
| T15 | Errors | Server unreachable | (network failure) | ✅ Pass | 0 ms | "Cannot reach SAP Service Layer. Check your internet connection and try again." |
| T16 | Create PO | Upload PO PDF | `POST Attachments2` (multipart) | ✅ Pass | 3866 ms | Attachment entry created |
| T17 | Create PO | Submit PO dated today | `POST Drafts` | ✅ Pass | 1447 ms | Correctly rejected with "SAP has no document numbering series open for 2026-11-09…" (see issue P-01) |
| T18 | Create PO | Submit PO dated 28-Sep-2026 | `POST Drafts` | ✅ Pass | 1740 ms | Draft created on branch 3 with the PDF attached |
| T19 | Create PO | New PO appears in My Orders | `GET Drafts` | ✅ Pass | 883 ms | Listed as "Awaiting approval" with terms, expected date and 📎 attachment |
| T20 | Create PO | Unknown item is rejected | `POST Drafts` | ✅ Pass | 836 ms | HTTP 404 → friendly "no longer exists in SAP" message |
| T21 | Cleanup | Delete test draft | `DELETE Drafts(n)` | ✅ Pass | 167 ms | Deleted |
| T22 | In-Transit | Acknowledge delivery | `PATCH DeliveryNotes(7161)` | ✅ Pass | 539 ms | `[Portal ACK 2026-11-09] Received in full — OK …` written to Comments |
| T23 | Cleanup | Restore delivery comments | `PATCH DeliveryNotes(7161)` | ✅ Pass | 305 ms | Original comments restored |
| T24 | Auth | Logout | `POST Logout` | ✅ Pass | 297 ms | Session closed; next call correctly returns 401 |

## Defects found and fixed during testing

| # | Found by | Problem | Fix |
| --- | --- | --- | --- |
| 1 | T17/T18 | PO submit always failed: SAP requires a **branch** (`BPL_IDAssignedToInvoice`) and the portal didn't send one. | Branch is read from the customer's `BPBranchAssignment` and sent on every PO draft. Verified on branch 3. |
| 2 | T17 | SAP's "define the numbering series in the Administration module" text was shown to customers. | Replaced with a clear message naming the date and asking Sufalam to open the series. |
| 3 | T20 | An invalid item returned raw "No matching records found (ODBC -2028)". | Mapped to a clear "no longer exists in SAP — refresh and try again" message. |

## Data written to TEST_280726

| What | State after testing |
| --- | --- |
| PO drafts (`NumAtCard` starting `API-TEST-`) | All deleted — verified 0 remaining |
| Delivery note DocEntry 7161 comments | Restored to original text — verified |
| Attachments2 records named `portal-api-test-*.pdf` | **4 remain** (entries 149070, 149072, 149074, 149076). Service Layer cannot delete attachments; harmless test files. |

## Not covered by this report

- **Screen-level (browser) testing.** These tests cover the API layer the screens call; the screens themselves were not clicked through in a browser.
- **Responsive layout** was reviewed in CSS only (breakpoints at 960 px and 640 px), not on real devices.
- **Load / performance.** Timings above are single calls; the slowest are Login (~2.5 s, SAP side) and the ledger (~5.6 s for 19 months).
