# Marketplace Pick & Pack Hybrid Android App

The Android app is an Expo SDK 54 hybrid shell. It keeps one persistent `react-native-webview` instance for the complete Next.js application and adds native Android scanner, safe-area, connection, update, and settings screens around it.

The APK never connects directly to SQLite or PostgreSQL. It contains no database URL, session secret, password hash, salt, database file, or owner credential. Login and every owner/worker permission remain enforced by the Next.js backend.

## Start The Owner PC Server

Use a production build for daily warehouse work:

```powershell
cd E:\marketplace1\marketplace
$env:DATABASE_URL="file:./dev.db"
$env:SESSION_SECRET="use-a-long-private-production-secret"
$env:NEXT_PUBLIC_APP_URL="http://100.x.x.x:3001"
$env:NEXT_PUBLIC_APP_NAME="Marketplace Pick & Pack"
npm.cmd run build
npm.cmd start -- --hostname 0.0.0.0 --port 3001
```

Do not use `npm run dev` for daily worker performance.

## Connect Android

Enter one server URL in the native setup screen:

- HTTPS domain: `https://pack.example.com`
- Tailscale: `http://100.x.x.x:3001`
- Same Wi-Fi: `http://192.168.x.x:3001`

HTTPS through Cloudflare Tunnel is recommended for production. Tailscale is the private backup. Public router port forwarding is not recommended.

## Native Scanner

The web packing page detects the APK and requests the native Expo Camera scanner through a strict `postMessage` bridge. The scanned value is JSON-escaped, returned to the existing packing form, and searched automatically. Scanning never auto-packs an order.

## Files And Downloads

Android's system file picker supplies `.xlsx`, `.csv`, `.pdf`, and `.txt` files to existing web upload inputs without broad storage permission. Same-origin downloads remain in the WebView where possible. The first release uses the Android browser/system handler as a fallback for downloads that the WebView cannot complete; authenticated download behavior must be verified on the target Android version.

## Expo Development

```powershell
cd E:\marketplace1\marketplace\mobile-app
npm.cmd install
$env:EXPO_PACKAGER_HOSTNAME="100.x.x.x"
npx.cmd expo start --clear --lan --port 8082
```

Open `exp://100.x.x.x:8082` in Expo Go. Expo Go can test the WebView and scanner, but final downloads, Android back behavior, and update installation must also be tested in a development/debug build.

## Version And Build

```powershell
npm.cmd run version:patch
npx.cmd expo prebuild --platform android --clean
cd android
gradlew.bat assembleDebug
```

Expected debug output: `android/app/build/outputs/apk/debug/app-debug.apk`. Do not commit APKs, AABs, generated native folders, signing keys, build output, screenshots, or private warehouse data.
