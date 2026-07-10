# Android Release Build

## Before Building

1. Confirm the worktree contains no `.env`, database, private test file, storage file, APK, AAB, screenshot, keystore, or signing password.
2. Run `npm.cmd run version:patch` (or `version:minor` / `version:major`). This increments both the app version and Android `versionCode`.
3. Run `npm.cmd install`, `npm.cmd run typecheck`, `npm.cmd run lint`, and `npx.cmd expo-doctor`.

## Generate Android Project

```powershell
cd E:\marketplace1\marketplace\mobile-app
npx.cmd expo prebuild --platform android --clean
```

Open `E:\marketplace1\marketplace\mobile-app\android` in Android Studio and allow Gradle sync to finish.

## Debug APK

Use Android Studio: **Build > Build Bundle(s) / APK(s) > Build APK(s)**.

Or run:

```powershell
cd android
gradlew.bat assembleDebug
```

Expected file: `android/app/build/outputs/apk/debug/app-debug.apk`.

## Release APK/AAB

Create the production signing key outside this repository. Keep the keystore, alias, passwords, and signing properties outside Git and outside shared folders. Configure Android Studio signing locally, then build a signed APK or AAB.

Never use the generated debug key for production releases. Never commit a keystore or signing configuration containing credentials.

## Publish A Direct APK Update

1. Upload the signed APK to an HTTPS download host.
2. Compute its SHA-256 checksum.
3. Set the owner PC environment variables described in `.env.example`.
4. Restart the production Next.js server.
5. Verify `/api/mobile/app-update` exposes only version metadata and the approved download URL.
6. Test optional and mandatory update screens on a spare Android device.

Android always shows its normal installation confirmation. The app does not request silent-install permission.
