# Next Phase Notes

## Bugs fixed in this phase

- Import Progress was capped to recent jobs and had no real pagination, filters, or row-size control.
- Import Progress exports were missing. Added safe CSV, XLSX, and TXT summary exports plus issue exports without raw customer/order row data.
- Import job detail needed clearer progress, elapsed time, rows/sec, estimated remaining, and next actions.
- Packing search suggestions were one large link, so workers could not directly pack, open details, or report a problem separately.
- Direct packing from search was missing. It now uses the same READY-only packing scope as the detail page.
- Packing scanner status was vague. It now shows camera starting, scanning, code found, opening result, permission, unsupported, and error states.
- Scanner duplicate-scan debounce and optional beep/vibration feedback are centralized helpers.
- Packing detail desktop actions were too far from the top. A sticky desktop action bar now keeps Pack, Problem, and Scan next AWB visible.
- Product gallery desktop thumbnails now sit beside the image, with controlled object-contain layout.

## Bugs found but intentionally left for next phase

- Automatic retry for failed import jobs was not added. Failed jobs may point to temporary upload files, so retry needs a durable file-retention policy first.
- PDF export for import jobs was skipped because the app does not currently have a report-PDF generator. CSV, XLSX, and TXT are safe and supported.
- Old pending review currently records an owner audit event and keeps orders in reports. A larger review queue/status workflow should be designed separately if the business wants old pending items hidden from daily packing.

## Recommended next phase

Improve Import Progress row drill-down:

- Paginated issue rows per job.
- Durable failed-job retry policy.
- Optional PDF summary export after choosing a report-generation library.
- Dedicated old-pending review queue if needed for warehouse operations.
