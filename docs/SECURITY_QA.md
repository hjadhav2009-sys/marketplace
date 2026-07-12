# Security QA

Phase 7 reviewed authentication boundaries, account authorization, server actions, idempotency, uploads, archives, workbook parsing, managed paths, snapshots, and worker errors.

## Confirmed Controls

- Amazon ZIP paths, nested archives, encryption, symlinks, entry count, compressed bytes, extracted bytes, and single-entry bytes are bounded.
- Workbooks are bounded by bytes, sheets, rows, columns, cell length, and total cells. Formula text is not executed; only cached results are consumed.
- Stored Amazon reparses validate database-recorded file count, single/aggregate bytes, aggregate parsed cells, archive-derived count, account, batch, and managed path before reading.
- Reference worksheets cannot become shipment candidates in owner UI or server action.
- Managed paths are resolved below the configured root and checked after `realpath`.
- Worker responses exclude filesystem paths, raw spreadsheet rows, binary files, session data, and database errors.
- Exact matching is account scoped and title matching is prohibited.

Remaining manual checks include malformed real-world workbook behavior, browser error wording, proxy deployment headers, and production retention/cleanup operations. Retain audit records according to business policy; retain private import files only as long as retry/review requires.
