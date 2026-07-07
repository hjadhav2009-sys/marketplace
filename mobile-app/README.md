# Marketplace Pick Pack Mobile

Phase 1 Android worker prototype for Marketplace Pick & Pack.

## Architecture

- The Android app talks only to the existing Next.js mobile API.
- The database stays on the owner PC.
- The APK does not contain `DATABASE_URL`, `SESSION_SECRET`, password hashes, salts, `.env`, database files, or admin secrets.
- Login sends username/password to the API. The server verifies the password and returns a secure web session cookie.
- Worker data is scoped by role and assigned account on the server.

## Start Backend On Owner PC

From the main repo:

```powershell
$env:DATABASE_URL="file:./dev.db"
$env:SESSION_SECRET="local-test-secret-change-me"
$env:NEXT_PUBLIC_APP_URL="http://localhost:3001"
$env:NEXT_PUBLIC_APP_NAME="Marketplace Pick & Pack"
npm.cmd run dev -- --host 0.0.0.0 --port 3001
```

Allow Node.js through Windows Firewall on the Private network.

## Server URL In Android App

Same Wi-Fi example:

```text
http://192.168.x.x:3001
```

Tailscale example:

```text
http://100.x.x.x:3001
```

For different Wi-Fi networks, use Tailscale or ZeroTier private IP. Plain router port-forwarding is not recommended.

## Scanner Flow

The native camera scanner reads the barcode locally and sends the scanned value to:

```text
GET /api/mobile/packing/search?code=<scanned-value>
```

The Pack button calls:

```text
POST /api/mobile/packing/confirm
```

Native scanning avoids the browser HTTPS camera limitation in local HTTP mode.

## Install And Run

```powershell
cd mobile-app
npm install
npm run start
```

To run on Android during development:

```powershell
npm run android
```

To build a local debug APK when Android SDK is installed:

```powershell
npm run build:android:debug
```

Expected APK path after a native Android build:

```text
mobile-app/android/app/build/outputs/apk/debug/app-debug.apk
```

Do not commit APK binaries, `node_modules`, generated native build folders, screenshots, or real warehouse data.
