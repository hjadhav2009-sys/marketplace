# Next Phase Notes

## Bugs fixed in Phase 6

- Reports no longer rely only on stale import-time missing listing/image warnings.
- Reports now show both “At import time” and “Current now” missing listing/image counts.
- Current missing listing/image status is recalculated from the current Listing Master for the selected account/marketplace/date/SKU filters.
- Reports now support date, account, marketplace, batch, SKU, status, and courier filters.
- Report tables are paginated and limited instead of rendering huge operational datasets.
- Reports include safe CSV, XLSX, and TXT downloads through `/reports/export`.
- Old pending is counted separately and linked to `/owner/old-pending`.
- Problems now have open/resolved tabs, filters, resolution notes, audit logging, and explicit return-to-ready control.

## Reports workflow

- Owner opens `/reports`.
- Default date filter is today.
- Filters can narrow by seller account, marketplace, import batch, SKU, status, and courier.
- Summary cards show total orders, today ready, today picked, today packed, open problems, old pending, current missing listing, current missing image, packed today, and pending today.
- Tables show daily, SKU, courier, account/marketplace, problem, and recent import summaries.

## Current vs import-time missing status

- “At import time” comes from import job warning counters.
- “Current now” recalculates against the latest Listing Master.
- If Listing Master is uploaded after Order Excel, current missing listing/image counts can reduce while import-time warnings remain for audit history.

## Report export safety

- CSV, XLSX, and TXT exports are supported.
- Export types include order summary, packed orders, pending orders, problem orders, old pending, missing listing, missing image, and SKU summary.
- Exports include operational fields only: marketplace, account, SKU, quantity, status, courier, batch/date, and masked tracking key.
- Full customer address/phone/raw import row data is not exported from reports.
- PDF export remains skipped because the app does not currently include a report-PDF generator.

## Problem resolution workflow

- `/problems` supports open/resolved tabs.
- Owner can resolve with a resolution note.
- Returning an order to READY is explicit via checkbox.
- “Keep as problem” records an audit log without deleting or resolving the problem.
- Resolved problems no longer appear in the Open tab.

## Recommended next phase

Phase 7: improve Users, roles, password reset, account assignment, and access control UX.

- Owner user-management UI.
- Worker account assignment UX.
- Owner password reset and temporary password workflow.
- Forgot password request flow.
- Role/account access checks for user management routes.
