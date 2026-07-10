import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getMobilePermissions, getMobileTabs } from "../lib/mobile-permissions";
import { classifyNavigation } from "../mobile-app/src/security/allowedOrigin";
import { inspectServerUrl } from "../mobile-app/src/security/safeUrl";
import { parseBridgeMessage } from "../mobile-app/src/bridge/bridgeTypes";
import { buildScannerResultScript } from "../mobile-app/src/bridge/scannerBridge";

const root = process.cwd();
const mobileRoot = join(root, "mobile-app");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

const dualWorker = {
  role: "PACKER" as const,
  canPick: true,
  canPack: true,
  canReportProblem: true
};
const picker = {
  role: "PICKER" as const,
  canPick: false,
  canPack: false,
  canReportProblem: true
};
const packer = {
  role: "PACKER" as const,
  canPick: false,
  canPack: false,
  canReportProblem: true
};
const owner = {
  role: "OWNER" as const,
  canPick: false,
  canPack: false,
  canReportProblem: false
};

assert.equal(getMobilePermissions(dualWorker).canPick, true, "Dual worker can pick");
assert.equal(getMobilePermissions(dualWorker).canPack, true, "Dual worker can pack");
assert.deepEqual(getMobileTabs(dualWorker.role, getMobilePermissions(dualWorker)), ["picker", "packing", "problems", "account"], "Dual worker sees Picker and Pack tabs");
assert.deepEqual(getMobileTabs(picker.role, getMobilePermissions(picker)), ["picker", "problems", "account"], "Picker-only worker does not see Pack tab");
assert.deepEqual(getMobileTabs(packer.role, getMobilePermissions(packer)), ["packing", "problems", "account"], "Packer-only worker does not see Picker tab");
assert.deepEqual(getMobileTabs(owner.role, getMobilePermissions(owner)), ["dashboard", "work", "imports", "admin", "account"], "Owner sees five native APK tabs");
assert.ok(!getMobileTabs(picker.role, getMobilePermissions(picker)).includes("admin"), "Picker-only worker does not see Admin");

const homeSource = read("mobile-app", "src", "screens", "HomeScreen.tsx");
const productCardSource = read("mobile-app", "src", "components", "ProductCard.tsx");
const pickerSource = read("mobile-app", "src", "screens", "PickerScreen.tsx");
const packingSource = read("mobile-app", "src", "screens", "PackingScreen.tsx");
const gallerySource = read("mobile-app", "src", "screens", "ProductGalleryScreen.tsx");
const detailsSource = read("mobile-app", "src", "screens", "ProductDetailsScreen.tsx");
const mobileClientSource = read("mobile-app", "src", "api", "client.ts");
const bottomNavSource = read("mobile-app", "src", "components", "BottomNav.tsx");
const appSource = read("mobile-app", "App.tsx");
const headerSource = read("mobile-app", "src", "components", "AppHeader.tsx");
const designSource = read("mobile-app", "src", "theme", "webMobileDesign.ts");
const packageJsonSource = read("mobile-app", "package.json");
const ownerImportsApiSource = read("app", "api", "mobile", "owner", "imports", "route.ts");
const ownerIssuesApiSource = read("app", "api", "mobile", "owner", "imports", "[jobId]", "issues", "route.ts");
const ownerUsersApiSource = read("app", "api", "mobile", "owner", "users", "route.ts");
const ownerSystemApiSource = read("app", "api", "mobile", "owner", "system", "route.ts");
const accountSwitchApiSource = read("app", "api", "mobile", "accounts", "select", "route.ts");
const accountScreenSource = read("mobile-app", "src", "screens", "AccountScreen.tsx");
const appRootSource = read("mobile-app", "src", "app", "AppRoot.tsx");
const webAppSource = read("mobile-app", "src", "screens", "WebAppScreen.tsx");
const scannerBridgeSource = read("mobile-app", "src", "bridge", "scannerBridge.ts");
const webMessageInjectorSource = read("mobile-app", "src", "bridge", "webMessageInjector.ts");
const bridgeTypesSource = read("mobile-app", "src", "bridge", "bridgeTypes.ts");
const safeUrlSource = read("mobile-app", "src", "security", "safeUrl.ts");
const serverSettingsSource = read("mobile-app", "src", "screens", "ServerSettingsScreen.tsx");
const updateScreenSource = read("mobile-app", "src", "screens", "AppUpdateScreen.tsx");
const updateRouteSource = read("app", "api", "mobile", "app-update", "route.ts");
const appJsonSource = read("mobile-app", "app.json");
const webPackingBridgeSource = read("lib", "native-app-bridge.ts");

assert.match(homeSource, /user\.tabs/, "APK bottom nav uses /api/mobile/me tabs");
assert.match(homeSource, /DashboardScreen/, "Owner dashboard screen is wired");
assert.match(homeSource, /WorkScreen/, "Owner Work tab screen is wired");
assert.match(homeSource, /OwnerImportsScreen/, "Owner Imports tab screen is wired");
assert.match(homeSource, /OwnerAdminScreen/, "Owner Admin tab screen is wired");
assert.match(appSource, /SafeAreaProvider/, "SafeAreaProvider exists at app root");
assert.match(packageJsonSource, /react-native-safe-area-context/, "Safe area dependency is installed");
assert.match(headerSource, /useSafeAreaInsets/, "Header uses top safe area inset");
assert.match(headerSource, /paddingTop: Math\.max\(insets\.top/, "Header applies top safe area padding");
assert.match(bottomNavSource, /MobileTab/, "Bottom nav is driven by mobile API tab permissions");
assert.match(bottomNavSource, /useSafeAreaInsets/, "Bottom nav uses bottom safe area inset");
assert.match(bottomNavSource, /paddingBottom: Math\.max\(insets\.bottom/, "Bottom nav applies bottom safe area padding");
assert.match(designSource, /webMobileDesign/, "Native app has web mobile design map");
assert.match(designSource, /berry: "#be185d"/, "Native design map mirrors web berry color");
assert.match(productCardSource, /design\.imageSquare/, "Product card uses shared square image style");
assert.match(productCardSource, /testID="picker-card-actions-max-3"/, "Picker card keeps max 3 worker actions");
assert.match(pickerSource, /markPicked/, "Picker card has Picked action");
assert.match(pickerSource, /cachedPickerGroups\.accountId === selectedAccountId/, "Picker cache is scoped by selected account");
assert.match(pickerSource, /getPickerGroups\(selectedAccountId/, "Picker groups request uses selected account");
assert.match(pickerSource, /setItems\(nextItems\)/, "APK has optimistic Picked flow");
assert.match(packingSource, /packStatus: "PACKING"/, "APK has optimistic Pack flow");
assert.match(packingSource, /searchPacking\(trimmed, selectedAccountId\)/, "Packing search uses selected account");
assert.ok(packingSource.indexOf("placeholder=\"FMPC0000000000\"") < packingSource.indexOf("Scan barcode"), "Packing manual search comes before scanner");
assert.match(gallerySource, /getProductImages/, "Gallery fetches images from image screen only");
assert.match(gallerySource, /design\.colors\.overlay/, "Gallery uses dark web-style lightbox background");
assert.match(detailsSource, /getProductDetails/, "Details fetches product details from details screen only");
assert.match(packageJsonSource, /react-native-webview/i, "Hybrid app includes the Expo-compatible WebView package");
assert.match(packageJsonSource, /expo-application[\s\S]*expo-network[\s\S]*expo-web-browser/, "Hybrid app includes native update, network, and external-browser support");
assert.match(ownerImportsApiSource, /pageSize/, "Owner mobile imports are paginated");
assert.match(ownerImportsApiSource, /take: pageSize/, "Owner mobile imports use page size limit");
assert.doesNotMatch(ownerIssuesApiSource, /rawData:\s*true/, "Owner issue API does not return raw private issue data");
assert.doesNotMatch(ownerUsersApiSource, /passwordHash|passwordSalt|salt/i, "Owner users API does not return password hashes or salts");
assert.doesNotMatch(ownerSystemApiSource, /DATABASE_URL|SESSION_SECRET|process\.env/, "Owner system API does not expose environment secrets");
assert.match(accountSwitchApiSource, /resolveMobileAccount/, "Mobile account switch validates account access server-side");
assert.match(accountSwitchApiSource, /setSelectedAccount/, "Mobile account switch updates selected account cookie");
assert.match(accountSwitchApiSource, /accountId: account\.account\.id/, "Mobile account switch persists selected account on user record");
assert.match(accountSwitchApiSource, /serializeMobileUser\(updatedUser\)/, "Mobile account switch returns updated selected account");
assert.match(accountScreenSource, /selectMobileAccount/, "APK Account screen can switch seller account natively");
assert.match(accountScreenSource, /Switch to this account/, "APK Account screen exposes account switch action");
assert.match(mobileClientSource, /SESSION_COOKIE_NAME = "mpp_session"/, "Mobile client only stores the auth session cookie");
assert.match(mobileClientSource, /extractSessionCookie/, "Mobile client ignores non-session Set-Cookie values");

assert.equal(inspectServerUrl("http://100.123.43.24:3001").kind, "private-http", "Tailscale HTTP is accepted as private");
assert.equal(inspectServerUrl("http://192.168.1.10:3001").kind, "private-http", "LAN HTTP is accepted as private");
assert.equal(inspectServerUrl("https://pack.example.com").kind, "https", "HTTPS server is accepted");
assert.equal(inspectServerUrl("javascript:alert(1)").kind, "invalid", "Dangerous server schemes are rejected");
assert.equal(classifyNavigation("https://pack.example.com/packing", "https://pack.example.com"), "internal", "Same origin remains inside WebView");
assert.equal(classifyNavigation("https://example.org/help", "https://pack.example.com"), "external", "External HTTPS opens outside WebView");
assert.equal(classifyNavigation("file:///data/private", "https://pack.example.com"), "blocked", "file URLs are blocked");
assert.equal(classifyNavigation("javascript:alert(1)", "https://pack.example.com"), "blocked", "javascript URLs are blocked");
assert.equal(parseBridgeMessage('{"version":1,"type":"OPEN_SCANNER","requestId":"test","payload":{}}')?.type, "OPEN_SCANNER", "Allowlisted bridge message is accepted");
assert.equal(parseBridgeMessage('{"version":1,"type":"RUN_SCRIPT","requestId":"test","payload":{}}'), null, "Unknown bridge message is rejected");
assert.match(buildScannerResultScript("test", "ABC';alert(1)//"), /"code":"ABC';alert\(1\)\/\/"/, "Barcode is preserved as JSON data inside the fixed event payload");
assert.match(appRootSource, /<WebAppScreen[\s\S]*webViewRef=\{webViewRef\}/, "App root owns one persistent WebView shell");
assert.doesNotMatch(appRootSource, /key=\{.*route|key=\{.*page/i, "WebView is not keyed or recreated per web route");
assert.match(webAppSource, /onShouldStartLoadWithRequest=\{shouldLoad\}/, "WebView validates every navigation");
assert.match(webAppSource, /sharedCookiesEnabled[\s\S]*thirdPartyCookiesEnabled=\{false\}/, "WebView preserves first-party session and blocks third-party cookies");
assert.match(webAppSource, /cacheEnabled[\s\S]*cacheMode="LOAD_DEFAULT"/, "Persistent WebView uses normal cache");
assert.match(webAppSource, /applicationNameForUserAgent="MarketplacePickPackNative/, "WebView identifies the native shell safely");
assert.match(scannerBridgeSource, /code: code\.trim\(\)\.slice\(0, 256\)/, "Native scan payload is length-limited");
assert.match(webMessageInjectorSource, /JSON\.stringify\(message\)/, "Native event payload is serialized instead of concatenated as executable code");
assert.match(bridgeTypesSource, /WEB_TO_NATIVE_TYPES[\s\S]*OPEN_SCANNER[\s\S]*CLEAR_APP_SESSION/, "Bridge uses an explicit message allowlist");
assert.match(safeUrlSource, /unsafe-public-http[\s\S]*javascript|protocol !== "http:"/, "Server URL validator limits accepted schemes");
assert.match(serverSettingsSource, /Public HTTP is unsafe/, "Unknown public HTTP requires a warning");
assert.match(updateScreenSource, /never installs updates silently/, "Update screen documents user-confirmed Android installation");
assert.match(updateRouteSource, /getMobileAppReleaseMetadata/, "Backend exposes safe update metadata endpoint");
assert.match(webPackingBridgeSource, /OPEN_SCANNER[\s\S]*marketplace:native-scan-result/, "Web packing page can request native scanner and receive a fixed event");
assert.doesNotMatch(appJsonSource, /READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|REQUEST_INSTALL_PACKAGES/, "APK requests no broad storage or silent-install permission");

function readFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      if (["node_modules", "android", ".expo"].includes(entry)) {
        return [];
      }

      return readFiles(path);
    }

    return [path];
  });
}

const mobileSource = readFiles(mobileRoot)
  .filter((file) => /\.(ts|tsx)$/.test(file) || /app\.json$|package\.json$/.test(file))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

assert.doesNotMatch(mobileSource, /DATABASE_URL|SESSION_SECRET|passwordHash|password salt/i, "Mobile app source does not contain backend secrets");
assert.match(mobileSource, /from ["']react-native-webview["']|<WebView\b|WebView\s+from/i, "Hybrid mobile app renders its persistent WebView shell");

console.log("Mobile app source tests passed.");
