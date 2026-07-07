# Next Phase Notes

## Bugs fixed in Phase 8

- CSV exports now neutralize spreadsheet formula injection values.
- Server-side product image caching now rejects obvious localhost, loopback, link-local, and private-network URLs before fetch.
- Global security headers were added for framing, MIME sniffing, referrer policy, permissions policy, and base CSP controls.
- `SECURITY_AUDIT.md` documents route protection, server actions, file/export surfaces, fixes applied, and remaining risks.

## Security audit summary

- Authentication already had password hashing, failed-login lockout, active-user checks, must-change-password redirect, and session invalidation.
- Authorization now includes multi-account worker assignment from Phase 7.
- Upload/import retained files remain under ignored `storage/import-jobs`.
- Product image cache remains under ignored `storage/product-images`.
- Exports use safe operational fields and now include CSV formula protection.

## Remaining security risks

- Add per-IP rate limits for forgot password, exports, scanner/search, and uploads.
- Consider full CSRF token coverage for sensitive server actions beyond SameSite cookies and server-side auth checks.
- Expand CSP after testing Next.js runtime script/style requirements.
- Run the full Codex Security preflight after Python is available in the environment.
- Run dependency audit regularly during release preparation.

## Recommended next phase

Manual security QA and release hardening:

- Verify Cloudflare Tunnel access rules.
- Test worker role boundaries in browser.
- Test forgotten-password request flow.
- Test CSV exports opening safely in Excel.
- Test image cache rejects local/private URLs with fake mappings.
