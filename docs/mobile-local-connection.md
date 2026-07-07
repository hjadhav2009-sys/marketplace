# Mobile Local Connection Guide

The future native Android app should connect to the owner PC/server running Marketplace Pick & Pack. Android should never connect directly to the database.

## Same Wi-Fi

1. Start the owner PC app on all network interfaces:

   ```powershell
   npm.cmd run dev -- --host 0.0.0.0 --port 3001
   ```

2. Find the PC private IP address, for example:

   ```text
   192.168.1.10
   ```

3. In the Android app, set server URL:

   ```text
   http://192.168.1.10:3001
   ```

4. Allow Windows Firewall access on the private network for Node.js / the app port.

Use this only on trusted warehouse Wi-Fi.

If `LOCAL_NETWORK_ONLY=true`, keep `TRUST_PROXY_HEADERS=false` for direct same-Wi-Fi access. Enable `TRUST_PROXY_HEADERS=true` only when a trusted proxy overwrites `X-Forwarded-For` / `X-Real-IP`; do not trust client-supplied forwarding headers.

## Different Wi-Fi Or Mobile Data

Use a private VPN instead of exposing the database or router port publicly.

Recommended options:

- Tailscale
- ZeroTier

Setup:

1. Install Tailscale or ZeroTier on the owner PC.
2. Install the same VPN on the Android phone.
3. Join both devices to the same private network.
4. Start the app on the owner PC at `0.0.0.0:3001`.
5. Set Android server URL to the private VPN IP:

   ```text
   http://100.x.y.z:3001
   ```

No public domain is required. Supabase is not required for local owner-PC mode.

## Safety Rules

- Do not put `DATABASE_URL` in the Android app.
- Do not put database passwords in the Android app.
- Do not put password hashes, password salt, `SESSION_SECRET`, `.env`, or SQLite files in the Android app.
- Do not port-forward the router unless the app is properly secured and intentionally exposed.
- Private VPN access is recommended for phones outside the warehouse Wi-Fi.
- Prefer Tailscale/ZeroTier private IP access over public router forwarding.

## Scanner Flow

The native Android scanner reads the barcode on the phone and sends only the scanned code to:

```text
GET /api/mobile/packing/search?code=FMPC0000000000
```

When the worker taps Pack, Android calls:

```text
POST /api/mobile/packing/confirm
```

The server decides what can be packed. The Android app does not update the database directly.
