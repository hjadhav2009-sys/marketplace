# Security Audit

Phase 8 defensive security audit for the local Marketplace Pick & Pack app.

## Scope

- Repository: `E:\marketplace1\marketplace`
- Mode: defensive local audit and hardening only
- No public targets scanned
- No private files, `.env`, database files, screenshots, customer/order/tracking data, or secrets committed

## Preflight

- Codex Security config preflight could not run because `python` and `py` are not available in this shell.
- Subagent tooling is available, but this session's tool policy requires explicit user authorization before spawning subagents. This audit was completed as a parent-agent local hardening pass.

## Route Map

### Public

- `/login`: public login, generic invalid-login errors, lockout support.
- `/forgot-password`: public reset request, does not reveal username existence.
- `/setup`: first-run setup guarded by existing user count.
- `/auth/session-ended`: public session-ended message.
- `/network-blocked`: public local-network block page.
- `/manifest.webmanifest`: public manifest.

### Owner Only

- `/dashboard`: owner dashboard.
- `/owner`: redirects to dashboard after owner check.
- `/owner/accounts`: seller account management.
- `/owner/users`: user, role, account assignment, password reset request handling.
- `/owner/uploads/*`: imports and review.
- `/owner/imports/*`: import jobs, issue drill-down, retry, exports.
- `/owner/sku-mappings/*`: listing/SKU master imports and exports.
- `/owner/old-pending`: old pending review queue.
- `/owner/system`: system health.
- `/owner/cleanup`: cleanup controls.
- `/reports` and `/reports/export`: owner operational reports and safe downloads.

### Worker Routes

- `/picker`, `/picker/[sku]`, `/picker/details`: owner/picker, scoped by selected assigned account.
- `/packing`, `/packing/[awb]`, `/packing/search`: owner/packer, scoped by selected assigned account.
- `/problems`: owner/packer view; owner-only resolution actions.
- `/accounts`: authenticated account switcher; workers can switch only assigned active accounts.
- `/change-password`: authenticated password change, allowed while `mustChangePassword` is true.

### File / Export Routes

- `app/owner/exports/[kind]/route.ts`: owner CSV exports.
- `app/reports/export/route.ts`: owner report CSV/XLSX/TXT exports.
- `app/owner/imports/export/route.ts`: owner import job exports.
- `app/owner/imports/[jobId]/issues/export/route.ts`: owner issue exports with safe context only.
- `app/owner/sku-mappings/export/route.ts`: owner SKU export.
- `app/product-images/[...path]/route.ts`: authenticated signed cached image route with account access checks.

## Server Actions

- Login, setup, change password, forgot password.
- Owner account/user/import/listing/system/cleanup actions.
- Picker and packer actions scoped by authenticated selected account.
- Problem resolution actions are owner-only.
- State-changing account selection validates active account and assigned access.

## Fixes Applied

### Export Hardening

- CSV formula injection mitigation added in `lib/csv.ts`.
- Values beginning with `=`, `+`, `-`, `@`, tab, or carriage return are prefixed before CSV output.
- Report exports use masked tracking keys and operational fields only.

### Image URL Hardening

- Server-side image cache now rejects non-http(s), localhost, loopback, link-local, and common private-network IP URLs before fetch.
- Existing image download timeout, max bytes, and image content-type checks remain in place.

### Security Headers

- Added global headers:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: same-origin`
  - `Permissions-Policy`
  - CSP with `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`

### Access Control

- Phase 7 added multi-account worker assignment.
- Account switching checks assigned active accounts.
- Disabled users are rejected during session checks.
- Must-change-password users are redirected before app access.

### Dependency Audit

- `npm audit` initially reported vulnerable `esbuild`, `js-yaml`, and `tmp` versions.
- `npm audit fix` updated the lockfile to patched versions.
- Final `npm audit --audit-level=moderate` result: 0 vulnerabilities.

## Findings

### High

- CSV formula injection risk in exports.
  - Fixed centrally in `lib/csv.ts`.

- Server-side image cache could request obvious local/private URLs.
  - Fixed with `isBlockedImageDownloadUrl`.

- Vulnerable transitive `tmp` dependency.
  - Fixed by `npm audit fix`.

### Medium

- Missing broad security headers.
  - Fixed in `next.config.ts`.

- Vulnerable transitive `js-yaml` dependency.
  - Fixed by `npm audit fix`.

- Codex Security preflight could not run because Python is unavailable.
  - Documented as tooling limitation.

### Low / Remaining

- No full CSRF token framework beyond SameSite cookies and server-side auth checks.
- Rate limiting is basic: login lockout exists, but forgot password and exports do not yet have per-IP rate limits.
- CSP is conservative for framing/object/base controls but not a full script/style policy because Next.js runtime inline requirements need careful testing.
- PDF export remains skipped until a report PDF generator is chosen.

## Private Data Safety

- `.env`, `*.db`, `private-test-data/`, `storage/import-jobs/`, `storage/product-images/`, PDFs, and real export file patterns are ignored.
- Tests use fake or source-level assertions only.
- No private customer names, addresses, phone numbers, order IDs, invoice numbers, or tracking IDs were printed or committed.
