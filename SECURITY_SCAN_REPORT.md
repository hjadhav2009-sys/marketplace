# Codex Security Scan Report

Scan date: 2026-07-07
Repository: `E:\marketplace1\marketplace`
Commit reviewed: `deadd7a Add secure mobile API foundation`
Scanner: Codex Security repository scan with targeted worker review

## Scope

Reviewed security-sensitive surfaces:

- Authentication, sessions, password reset, account switching, and owner user management.
- Mobile API routes under `app/api/mobile/`.
- Owner upload, Flipkart import jobs, retained import files, retry, and parser flow.
- Reports, import issue exports, owner exports, problems, and old pending workflows.
- Product image cache/download route, image signing, network allowlist middleware, security headers, ignored private folders.

Private data was not printed or copied. Real order files, `.env`, `dev.db`, `private-test-data`, and storage files were not committed.

## Executive Summary

The scan did not find a direct worker-to-owner authorization bypass, mobile API database-secret leak, report export account-scope bypass, cached image path traversal, or issue-export private raw-data leak in the reviewed code.

The highest-priority risks are operationally important before production exposure:

1. Public demo credentials are displayed on the login page and seeded users are active.
2. Passwords are stored with unsalted fast SHA-256.
3. Server-side product image caching can still be used for SSRF through loopback variants, DNS-to-private hosts, or redirects.
4. Flipkart import uploads do not enforce a max size before buffering and retaining files.
5. `LOCAL_NETWORK_ONLY` trusts missing/spoofable forwarding headers.

## Findings

### F-001: Public demo credentials can become a full login

Severity: High in seeded deployments; Low/Informational if never seeded or if demo users are disabled before exposure.

Evidence:

- `app/login/page.tsx` displays seed usernames and the shared demo password.
- `prisma/seed.ts` creates active owner, picker, and packer users with that same default password hash.
- `lib/production-checks.ts` warns about active demo users/passwords, but this depends on operators running and acting on the check.

Attack path:

An unauthenticated visitor opens `/login`, reads the displayed seed credentials, and signs in as a still-active seeded owner account.

Recommendation:

- Remove demo credentials from the login UI outside explicit development mode.
- Seed users should be inactive or forced to change password immediately.
- Make production readiness fail hard if active demo credentials exist.

### F-002: Passwords use unsalted fast SHA-256

Severity: Medium.

Evidence:

- `lib/password.ts` hashes passwords with one SHA-256 digest and verifies by recomputing it.

Attack path:

If the database, backup, or password hash table leaks, weak or reused passwords can be cracked cheaply offline.

Recommendation:

- Replace SHA-256 with Argon2id or bcrypt.
- Add per-password salt through the chosen password-hashing library.
- Support migration-on-login: accept existing SHA-256 once, then upgrade to the new hash format after successful login.

### F-003: Cached image downloader SSRF bypass

Severity: Medium; potentially High if the owner PC/server can reach sensitive loopback, LAN, or metadata services.

Evidence:

- Imported/product image URLs are stored from owner or import flows.
- URL validation only checks syntactic `http://` or `https://` in parts of the import path.
- `lib/image-cache.ts` blocks some literal local/private hosts, then calls `fetch()` with default redirect behavior.
- The blocklist misses loopback variants such as `127.0.0.2`, DNS names resolving to private IPs, IPv4-mapped IPv6 cases, and redirect targets.

Attack path:

A malicious listing/image URL is imported or entered, then image caching fetches it server-side. The request can reach internal or loopback network services even if the response is later rejected as a non-image.

Recommendation:

- Resolve hostnames server-side and block private, loopback, link-local, multicast, and unique-local addresses before connecting.
- Disable automatic redirects or revalidate every redirect target before following it.
- Re-check the final response URL.
- Keep timeout, max bytes, and `image/*` content-type checks.
- Add tests for `127.0.0.2`, IPv4-mapped IPv6, private DNS resolution, and redirects to private hosts.

### F-004: Unbounded Flipkart import upload can exhaust memory/disk

Severity: Medium.

Evidence:

- `app/owner/uploads/actions.ts` checks that the Flipkart order file exists and has an allowed extension, but does not enforce a max size.
- `src/lib/import-jobs/runner.ts` reads the uploaded file into memory with `arrayBuffer()`, writes it to `storage/import-jobs`, and later parses retained files.
- Legacy PDF upload has a size cap, but Flipkart `.xlsx`/`.csv` import does not have the same guard.

Attack path:

An authenticated owner uploads an extremely large allowed-extension file. The server buffers it, writes it to disk, and attempts to parse it, consuming memory and storage and degrading or crashing the app.

Recommendation:

- Add a max upload size for Flipkart listing/order `.xlsx` and `.csv`.
- Reject oversize files before buffering.
- Add retained import file cleanup.
- Prefer streaming CSV parsing for large files.

### F-005: Local-network allowlist trusts missing/spoofable forwarded headers

Severity: Medium as a network access-control weakness; reduced by normal app authentication.

Evidence:

- `middleware.ts` gets the client IP from `x-forwarded-for` or `x-real-ip`.
- `lib/network.ts` trusts the first forwarded value.
- `isAllowedLocalNetworkIp()` returns true when the normalized IP is missing.

Attack path:

If the app is reachable directly or through a proxy that does not strip client-supplied forwarding headers, a request can omit or spoof forwarding headers and bypass `LOCAL_NETWORK_ONLY`.

Recommendation:

- Do not allow missing IP by default when `LOCAL_NETWORK_ONLY=true`.
- Trust forwarded headers only when behind a known trusted proxy.
- Prefer direct socket/source IP from the platform when available.
- For remote access, prefer Tailscale/ZeroTier or properly secured Cloudflare Tunnel instead of router port forwarding.

### F-006: Login reveals inactive/locked account state

Severity: Low.

Evidence:

- `lib/auth-helpers.ts` returns `inactive` and `locked` before password verification.
- Web login and mobile login return distinct inactive/locked messages.

Attack path:

An unauthenticated caller can submit guessed usernames with any password and identify accounts that are inactive or locked.

Recommendation:

- Return a generic login failure for inactive/locked users until password verification succeeds, or use a generic message for all failed logins.
- Keep detailed state visible only to owner/admin screens.

### F-007: Mobile rate limiting trusts spoofable forwarded IP headers

Severity: Low.

Evidence:

- `lib/mobile-api.ts` rate-limit buckets use IP derived from `x-forwarded-for` / `x-real-ip`.
- `lib/network.ts` trusts the first forwarded value.

Attack path:

If clients can influence forwarded headers, they can rotate `X-Forwarded-For` values to bypass per-IP mobile login/search rate limits.

Counterevidence:

Login also has per-user failed-login lockout, so this is not unlimited password guessing for one account.

Recommendation:

- Reuse a trusted-proxy-aware IP helper.
- Combine IP rate limits with username/account and session/device rate limits.

## Validated Non-Findings

- No mobile API route was found returning password hashes, password salts, database URLs, session secrets, or raw Prisma user objects.
- Mobile picker, packing, product, and sync routes use authenticated context and account-scoped filters.
- Worker-to-owner access bypass was not found in reviewed mobile API, report, import issue, problem, old pending, or account switching paths.
- Owner report/import/issue export routes are owner-gated.
- CSV/TXT/XLSX export formula escaping is centralized through `safeSpreadsheetValue()` / `rowsToCsv()` in reviewed main export paths.
- Cached image route path traversal was mitigated by strict segment parsing, allowed filenames, signed URLs, and contained filesystem resolution.
- `.gitignore` covers `.env`, local DB files, `private-test-data`, storage, real seller files, labels, invoices, and other private artifacts.

## Recommended Fix Order

1. Remove demo credentials from production login UI and force/disable seeded demo users.
2. Migrate password hashing to Argon2id or bcrypt.
3. Harden image downloading against SSRF redirects, DNS-to-private hosts, and full private IP ranges.
4. Add Flipkart import file size limits and retained file cleanup.
5. Make local-network IP checks trusted-proxy-aware and fail closed on missing IP.
6. Normalize login failure messages.
7. Harden mobile rate-limit keying.

## Commands and Tooling Notes

- Codex Security preflight succeeded after running Python outside the sandbox with explicit runtime facts.
- A deterministic repository rank input was generated with 356 rows for the scan artifact set.
- Five parallel security workers reviewed auth, mobile API, imports, exports/reports, and image/network/config surfaces.
- No tests or builds were run as part of this read-only scan because no code fixes were applied.

## Artifact Location

Local scan artifacts were written under:

`C:\Users\Admin\AppData\Local\Temp\codex-security-scans\marketplace\deadd7a_20260707-081252`

This report is safe to commit if desired; it contains no private order data, secrets, or real customer data.
