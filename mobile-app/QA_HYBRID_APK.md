# Hybrid APK QA Checklist

Use fake warehouse data only. Do not save screenshots containing customer, order, invoice, or Tracking ID data.

## Server Modes

- [ ] HTTPS domain connects and keeps login session.
- [ ] Tailscale `100.64.0.0/10` URL connects from a different Wi-Fi network.
- [ ] Same-Wi-Fi private URL connects.
- [ ] Public HTTP address shows a warning.
- [ ] Unsafe `file:`, `javascript:`, `data:`, `content:`, and `intent:` server URLs are rejected.
- [ ] Production testing uses `npm.cmd run build` and `npm.cmd start`, not the development server.

## Authentication And Roles

- [ ] Owner login shows all web owner and worker pages.
- [ ] Picker sees only assigned picker pages/accounts.
- [ ] Packer sees only assigned packing pages/accounts.
- [ ] Picker + Packer worker sees both workflows.
- [ ] Logout returns to web login.
- [ ] Forced password change remains enforced.
- [ ] Disabled user session is rejected.
- [ ] Switching seller account refreshes dashboard, picker, packing, reports, and imports.

## Owner Web Features

- [ ] Dashboard, imports, listings, reports, accounts, users, problems, old pending, and system pages load inside the same WebView.
- [ ] Flipkart Listing Master and Daily Order file pickers open Android's system picker.
- [ ] Import progress remains responsive during a large fake upload.
- [ ] CSV/XLSX/TXT report and issue downloads work or open the documented system fallback.
- [ ] No page asks for broad storage permission.

## Worker Flow

- [ ] Picker cards, image gallery, Picked, and Problem work.
- [ ] Packing manual search works.
- [ ] APK packing page shows **Scan with Android camera**.
- [ ] Native scanner opens without remounting the WebView.
- [ ] Scan result fills/searches Tracking ID but never auto-packs.
- [ ] Multi-item shipment shows all ready items.
- [ ] Direct Pack skips packed/problem items.
- [ ] Android back closes scanner first, then navigates WebView history.

## Native Shell

- [ ] Status bar and navigation bar do not overlap content at 360px, 390px, 430px, and tablet width.
- [ ] Cold launch shows native boot screen, never a blank white screen.
- [ ] Warm launch preserves a valid web session.
- [ ] Owner-PC unavailable screen gives Retry, Change server, and Tailscale help.
- [ ] Reconnect does not discard WebView state unless reload is necessary.
- [ ] Native settings can open home, scanner test, update check, clear cache/session, and change server.
- [ ] Changing server clears the old web session and requires login on the new origin.

## Updates

- [ ] No-update metadata opens the web app normally.
- [ ] Optional update allows **Later** and remembers that version.
- [ ] Mandatory update blocks WebView only after confirmed server metadata.
- [ ] Unsafe update URL is disabled.
- [ ] Update opens Android browser/downloader and Android shows installation confirmation.
- [ ] No silent installation or broad install permission exists.

## Navigation Security

- [ ] Same-origin links stay in WebView.
- [ ] External HTTPS, email, and telephone links open outside WebView.
- [ ] External pages cannot send native bridge commands.
- [ ] Unknown bridge messages are ignored.
- [ ] Barcode text containing quotes or script-like characters is handled as data only.
- [ ] APK source and built artifact contain no database URL, session secret, password hash, salt, or credential.

## Performance Notes

Record on a production server and representative phone:

- Cold shell visible: target under 1 second.
- Server connection check: target under 2 seconds on LAN/Tailscale.
- First WebView meaningful content.
- Warm internal navigation.
- Native scanner open time.
- Scan-to-search result time.
- Import upload responsiveness.
- Export/download completion.
- Offline-to-reconnected recovery.

Development timing logs contain durations only and must not include scanned values or private row data.
