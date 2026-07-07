# Next Phase Notes

## Bugs fixed in Phase 7

- Worker account access is no longer limited to one legacy `accountId`; users can now have multiple assigned active accounts.
- Account switching checks both legacy default account and assigned accounts, so workers cannot switch to unassigned accounts.
- Owner user management now has search, role, active/inactive, and assigned-account filters.
- Owner user forms show grouped marketplace/account assignment.
- Password reset requests can be submitted from `/forgot-password` without revealing publicly whether the username exists.
- Owner can see open reset requests on `/owner/users`, reset the worker password, force next-login password change, or mark the request handled.
- Password reset actions still hash passwords, clear worker sessions, and never log plaintext passwords.
- Owner cannot remove the last active owner through role/status changes.

## User roles and assignment

- Owner has full access to active accounts.
- Picker and packer can switch only assigned active accounts.
- Workers require at least one assigned account when active.
- `accountId` remains the default selected account for compatibility, while assigned accounts support multi-account workers.

## Password reset workflow

- Worker opens `/forgot-password`.
- Worker submits username.
- App always shows the same confirmation message.
- Owner reviews open requests on `/owner/users`.
- Owner sets a temporary password, forces password change on next login, and the app closes existing worker sessions.
- Plaintext temporary passwords are never logged or stored.

## Access control UX

- `/owner/users` explains password hashes cannot be viewed.
- User cards show role, active status, last login, failed-login/lock status, active sessions, and assigned accounts.
- Account assignment is grouped by marketplace.

## Recommended next phase

Phase 8: defensive Security 360 audit and hardening.

- Route/action authorization map.
- Upload/export hardening.
- CSV formula safety review.
- Image URL download hardening.
- Session, CSRF, and security-header review.
- Secret/private-file scan.
