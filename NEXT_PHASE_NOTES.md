# Next Phase Notes

## Bugs fixed in Phase 5

- Import job issue rows now have a drill-down page at `/owner/imports/[jobId]/issues` with pagination, filters, safe operational context, and downloads.
- Job-level issue exports now include SKU and masked shipment/order-item keys without exposing raw customer/order row data.
- Failed/cancelled import retry is now guarded by retained private source files under `storage/import-jobs`.
- Retry is unavailable when the retained file is missing or outside the private import-job storage directory.
- The old pending button no longer only records an audit event. It now moves old pending rows into an owner review queue.
- Picker keeps Today work separate and links owners to the old pending review queue.

## Import issue drill-down

- Default page size is 50 rows.
- Supported page sizes are 25, 50, and 100.
- Filters include issue type, row number, and SKU.
- The table shows row number, issue type, message, SKU, masked shipment key, masked order item key, and created time.
- Raw import row data is not rendered or exported.

## Retry policy

- Browser import jobs retain uploaded files in ignored `storage/import-jobs`.
- A failed or cancelled job can retry only when the retained file still exists inside that folder.
- Retry creates a new job using the retained private file and starts processing it.
- The UI shows: “Retry unavailable because source file was cleaned up.” when retry is not safe.

## Old pending review workflow

- `/owner/old-pending` lists older READY orders separately from Today work.
- Owners can keep pending, move to problem, mark reviewed/carry forward, or archive from the today-view workflow.
- Orders are not deleted.
- Moving to problem creates an open problem order only if one is not already open.

## Bugs found but intentionally left for Phase 6

- Reports and Problems pages still need a full operational cleanup with current missing-listing/missing-image status.
- PDF export remains skipped because the app does not currently have a report-PDF generator.
- Problem resolution notes and audit history should be expanded in the dedicated Problems phase.

## Recommended next phase

Phase 6: improve Reports and Problems workflow.

- Date/account/marketplace/status filters.
- Current vs import-time missing listing/image counts.
- Safe CSV/XLSX/TXT report downloads.
- Owner/admin problem resolution with notes and audit log.
- Old pending counts integrated into reports without polluting Today work.
