# Phase 7.3.6 RC1 Staging QA Package

Status: **PENDING — PREPARED, NOT EXECUTED**

This package is for a later sanitized staging session. It is not evidence that browser or two-worker QA passed. Use only a disposable synthetic database or an owner-approved sanitized copy. Disable outbound email and marketplace integrations, use fake identifiers and people, show an unmistakable QA banner, and keep screenshots outside Git when they may contain operational data.

## Environment evidence

Record before testing:

- Release commit and PR merge-test SHA.
- QA database path alias, byte size, and SHA-256; never record a private absolute path.
- Real database SHA-256 before and after the session, calculated read-only.
- Synthetic account names and user roles; never record passwords or cookies.
- Server command, port, Node version, browser versions, and test date.
- Confirmation that outbound integrations, production storage, and production credentials are unavailable.

## Browser-width matrix

Test every route at exactly `360`, `390`, `430`, `768`, `1024`, and `1440` CSS pixels. For each cell record `PASS`, `FAIL`, or `BLOCKED` plus an evidence reference.

| Scenario | 360 | 390 | 430 | 768 | 1024 | 1440 |
| --- | --- | --- | --- | --- | --- | --- |
| Login, logout, and account selection | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Product Inventory list/search/details | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Manual Flipkart listing create/edit/stale edit | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Manual Amazon listing create/edit/stale edit | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Catalog refresh and import progress/recovery | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Missing-listing link/minimal/full resolution | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Daily Orders initial, cumulative, and repeat upload | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Consignment upload/review/resolve/activate | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Work Hub source separation and summaries | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Pick, optional Mark, optional Assembly, and Pack | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Scanner exact/multiple/no-result/completed result | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Problems, resolution, assignment, and recovery | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |

At every width verify no horizontal clipping, overlapping text, hidden actions, or navigation obstruction; touch targets are at least 44 px; long titles and identifiers wrap; missing images preserve readable text; large quantities remain legible; pending, empty, success, validation, and server-error states are visible; keyboard/tab order and focus are usable; and browser console/network logs contain no unexplained hydration error, failed required request, duplicate submission, or private payload.

## Synthetic import scenarios

1. Import 100 fake Flipkart Orders and record Order, Pick task, projection member, issue, and receipt counts.
2. Import a cumulative file containing the same 100 plus 50 new Orders. Expect 50 created, 100 already imported, zero duplicate Orders, and zero duplicate Pick tasks.
3. Import the same 150 again. Expect 150 already imported and no new work.
4. Exercise an exact repeated row and conflicting quantity, Tracking ID, Seller SKU, shipment identity, and Order Item ID.
5. Verify invalid blank, text, zero, negative, and decimal quantities never create actionable work.
6. Resolve held Order catalog work by Link Existing, Create Minimal, and profile-bound Full Listing.
7. Resolve Flipkart and Amazon Consignment catalog work without changing Quantity Sent/Shipped, activating the batch, or creating WorkTasks.

## Two-worker concurrency matrix

Use two separate browser profiles and two distinct synthetic worker users. Capture the before/after task version, receipt count, action-log count, live-event count, and projection membership.

| Scenario | Expected | Actual | Evidence | Result |
| --- | --- | --- | --- | --- |
| Both workers open the same queue/card | Same committed version shown or controlled stale refresh | — | — | PENDING |
| Identical double click/network retry | One mutation and one durable result | — | — | PENDING |
| Different actions on the same work | One wins; other receives controlled stale/conflict response | — | — | PENDING |
| Assignment changes while card is open | Old actor cannot mutate after authorization/state recheck | — | — | PENDING |
| Permission/account access removed mid-session | Next action is denied server-side | — | — | PENDING |
| Problem report and exact-stage resolution | No completed stage rewinds | — | — | PENDING |
| Network interruption after submission | Safe replay; no duplicate task/receipt/log/event | — | — | PENDING |
| Order Pick → Pack | Pack remains gated until Pick completes | — | — | PENDING |
| Order Pick → Mark → Pack | Snapshot/instructions preserved; Pack gated | — | — | PENDING |
| Order Pick → Assembly → Pack | Assembly snapshot preserved; Pack gated | — | — | PENDING |
| Order Pick → Mark → Assembly → Pack | Actual route and both instructions preserved | — | — | PENDING |
| Consignment Pick → Pack | Quantity and batch completion remain correct | — | — | PENDING |
| Consignment Pick → Mark → Pack | Mark instructions and quantity remain correct | — | — | PENDING |
| Consignment Pick → Assembly → Pack | Assembly instructions and quantity remain correct | — | — | PENDING |
| Consignment Pick → Mark → Assembly → Pack | Both instruction snapshots and quantity remain correct | — | — | PENDING |
| Two packers complete one package | One package completion and one final state | — | — | PENDING |
| Package siblings and partial progress | Sibling problem blocks Pack; quantities reconcile exactly | — | — | PENDING |

## Evidence sheet

For each defect or completed scenario record:

```text
QA run ID:
Release SHA:
Width/browser/profile:
Synthetic account and role:
Route/scenario:
Before state/version/counts:
Action and client request ID alias:
Expected:
Actual:
After state/version/counts:
Console/network result:
Evidence reference:
Severity: BLOCKER | HIGH | MEDIUM | LOW | NONE
Retest result:
```

Do not mark this gate complete until all six widths and the two-worker matrix have real evidence and every Blocker/High defect has been repaired and retested.
