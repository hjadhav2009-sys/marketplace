# QA Checklist

Final UI/UX and security smoke checklist for Marketplace Pick & Pack.

## UI Pages Reviewed

- `/login`: simple owner/worker login with forgot-password link.
- `/forgot-password`: public request flow with non-enumerating success message.
- `/change-password`: forced password-change route for users marked `mustChangePassword`.
- `/dashboard`: owner landing page with selected company, marketplace, and seller account context.
- `/accounts`: authenticated account switcher with assigned-account scoping.
- `/owner/accounts`: owner seller-account management.
- `/owner/users`: owner user, role, account assignment, password reset, and request handling.
- `/owner/uploads/new`: marketplace/account/import-type wizard with legacy imports behind advanced wording.
- `/owner/imports`: paginated import progress table with filters and downloads.
- `/owner/imports/[jobId]`: import progress detail with review, issue, retry, and download actions.
- `/owner/imports/[jobId]/issues`: paginated issue drill-down with safe fields only.
- `/picker`: compact worker queue with image cards, actions, filters, and load-more behavior.
- `/packing`: scan/manual Tracking ID search with compact result cards and direct pack actions.
- `/packing/[awb]`: controlled image gallery, compact order detail, and sticky worker actions.
- `/owner/old-pending`: old pending review queue separated from today's work.
- `/reports`: paginated report dashboard with current vs import-time missing mapping status.
- `/problems`: open/resolved problem workflow with owner resolution actions.
- `/owner/system`: owner-only system and readiness page.

## UI/UX Smoke Checks

- Mobile, tablet, and desktop layouts avoid accidental horizontal page overflow.
- Product image areas use square or controlled aspect layouts with `object-contain`.
- Worker actions remain clear: Picked, Pack, Problem, Scan next.
- Owner actions remain clear: Import, Reports, Users, Accounts.
- Empty states are compact and include useful next actions.
- Slow pages have loading states or skeleton routes where available.
- Tables that can grow are paginated or export-limited.
- Account and marketplace context is visible on owner/worker workflows.
- `/owner` is not the visible default dashboard; `/dashboard` is the owner landing route.

## Security Smoke Checks

- Owner-only routes reject picker and packer users.
- Picker and packer cannot open owner users, accounts, imports, reports, or system pages.
- Workers can switch only assigned active accounts.
- Disabled users are rejected during session checks.
- Users marked `mustChangePassword` are routed to password change before app use.
- Forgot-password does not reveal whether a username exists and is publicly reachable.
- Export routes require owner access where intended.
- Issue drill-down and issue export require owner access.
- Reports export requires owner access.
- Retained import retry only works for files inside ignored import-job storage.
- CSV, TXT, and XLSX exports neutralize values starting with `=`, `+`, `-`, `@`, tab, or carriage return.
- Image cache rejects localhost, loopback, link-local, and common private-network URLs before server-side fetch.
- Upload flows validate file types and size limits before processing.
- `.env`, `*.db`, `private-test-data/`, `storage/import-jobs/`, and `storage/product-images/` remain ignored.
- Product descriptions/specs are rendered as React text, not raw HTML.
- Docs and logs should not contain secrets, passwords, private customer data, full tracking IDs, or real order files.

## Fixes From Final QA

- `/forgot-password` is explicitly public in middleware so workers can request help before login.
- TXT and XLSX export helpers now use the same spreadsheet-formula neutralization as CSV exports.

## Known Remaining Issues

- Full browser/device visual QA still needs to be run on the warehouse PC and worker phones.
- CSP is intentionally minimal; expand script/style policy only after testing Next.js runtime requirements.
- Add per-IP rate limits for forgot-password, exports, upload, and scanner/search routes in a future hardening pass.
- PDF report exports remain skipped until a report PDF generator is selected.

## Manual Browser Test Checklist

1. Login as owner.
2. Switch marketplace/account.
3. Import listing master with a fake/sanitized local file.
4. Import daily orders with a fake/sanitized local file.
5. Check import progress pagination and downloads.
6. Check issue drill-down and issue export.
7. Open picker on mobile width.
8. Click product image gallery.
9. Mark one SKU picked.
10. Open packing.
11. Scan/search a fake Tracking ID.
12. Pack directly from a result card.
13. Check reports and exports.
14. Resolve one fake problem.
15. Confirm picker/packer cannot open owner pages.
16. Confirm forgot-password request creates an owner-visible request without revealing username existence.

## Release Readiness Checklist

- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run test:validators`
- `git diff --check`
- `npm.cmd audit --audit-level=moderate`
- Production build with local validation environment variables.
- Confirm ignored private folders are not staged.
- Confirm latest commit is pushed to GitHub.
