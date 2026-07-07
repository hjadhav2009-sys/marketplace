# Mobile Native API Plan

This app is being prepared for a future native Android warehouse app. The Android app must talk only to the local Marketplace Pick & Pack server API. It must never connect directly to SQLite, PostgreSQL, Supabase, or any database host.

## Architecture

```text
Android app -> local Next.js API -> Prisma/server code -> database on owner PC/server
```

- The database stays on the owner PC or private server.
- `DATABASE_URL`, database password, password hashes, password salt, `SESSION_SECRET`, `.env`, SQLite files, and storage files stay on the server.
- The Android app stores only the server URL and its authenticated session cookie/token.
- No database password belongs in the Android APK, Android source code, Gradle config, or mobile settings screen.

## Authentication Flow

1. Android sends username and password to `POST /api/mobile/auth/login`.
2. The server verifies the password hash using existing backend password logic.
3. Disabled users and locked users are rejected by the server.
4. If the user must change password, the API returns `{ mustChangePassword: true }`.
5. On success, the server creates a secure server-side session and returns safe user/account data.
6. Android sends later API requests to the same local server with the session cookie.
7. `POST /api/mobile/auth/logout` clears the session.

The mobile response never includes password hash, password salt, session secret, database URL, or raw private data.

## Role And Account Scope

Every mobile endpoint must enforce these rules on the server:

- User must be logged in and active.
- `mustChangePassword` users cannot use worker APIs until password change is complete.
- Owner can access all active accounts.
- Picker and packer can access only assigned active accounts.
- `accountId` from Android is only a selector. It is never authorization proof.
- Worker data is scoped by role and assigned account.

## API Surface

- `POST /api/mobile/auth/login`
- `POST /api/mobile/auth/logout`
- `GET /api/mobile/me`
- `GET /api/mobile/picker/groups`
- `POST /api/mobile/picker/mark-picked`
- `POST /api/mobile/picker/problem`
- `GET /api/mobile/packing/search`
- `POST /api/mobile/packing/confirm`
- `POST /api/mobile/packing/problem`
- `GET /api/mobile/products/[sku]/images`
- `GET /api/mobile/products/[sku]/details`
- `GET /api/mobile/sync/status`

## Fast Worker Data

Picker group list returns compact fields only:

- SKU
- title
- quantity
- pending/picked/problem counts
- color and size
- main image URL
- cache status
- status

The picker list must not return full description, all specifications, all listings, customer address, phone, password hash, password salt, or database internals.

Product details are separate at `GET /api/mobile/products/[sku]/details` so heavy listing fields load only when the worker opens Details.

## Packing And Scanner Flow

Native Android scanner reads the barcode locally, then sends the scanned value to:

```text
GET /api/mobile/packing/search?code=FMPC0000000000
```

The API searches Tracking ID first, then AWB/internal keys. If one Flipkart Tracking ID has multiple SKUs, the API returns all matching shipment items. The Android app shows the result and calls:

```text
POST /api/mobile/packing/confirm
```

Packing confirmation packs only `READY` items, skips already packed items, leaves problem items as problem, and writes server-side audit/scan logs.

Native Android scanning does not need browser camera HTTPS permissions because the scanner runs inside the native app and only sends the scanned text to the API.

## Network Model

Same Wi-Fi is allowed for local warehouse use. For different Wi-Fi/mobile networks, use a private VPN such as Tailscale or ZeroTier.

Plain public router port forwarding is not recommended. If remote access is required, prefer a private VPN or a properly protected tunnel with strong authentication.
