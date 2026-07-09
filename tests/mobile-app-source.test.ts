import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getMobilePermissions, getMobileTabs } from "../lib/mobile-permissions";

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
assert.match(pickerSource, /setItems\(nextItems\)/, "APK has optimistic Picked flow");
assert.match(packingSource, /packStatus: "PACKING"/, "APK has optimistic Pack flow");
assert.ok(packingSource.indexOf("placeholder=\"FMPC0000000000\"") < packingSource.indexOf("Scan barcode"), "Packing manual search comes before scanner");
assert.match(gallerySource, /getProductImages/, "Gallery fetches images from image screen only");
assert.match(gallerySource, /design\.colors\.overlay/, "Gallery uses dark web-style lightbox background");
assert.match(detailsSource, /getProductDetails/, "Details fetches product details from details screen only");
assert.doesNotMatch(packageJsonSource, /react-native-webview/i, "Mobile app does not depend on WebView");
assert.match(ownerImportsApiSource, /pageSize/, "Owner mobile imports are paginated");
assert.match(ownerImportsApiSource, /take: pageSize/, "Owner mobile imports use page size limit");
assert.doesNotMatch(ownerIssuesApiSource, /rawData:\s*true/, "Owner issue API does not return raw private issue data");
assert.doesNotMatch(ownerUsersApiSource, /passwordHash|passwordSalt|salt/i, "Owner users API does not return password hashes or salts");
assert.doesNotMatch(ownerSystemApiSource, /DATABASE_URL|SESSION_SECRET|process\.env/, "Owner system API does not expose environment secrets");
assert.match(accountSwitchApiSource, /resolveMobileAccount/, "Mobile account switch validates account access server-side");
assert.match(accountSwitchApiSource, /setSelectedAccount/, "Mobile account switch updates selected account cookie");
assert.match(accountScreenSource, /selectMobileAccount/, "APK Account screen can switch seller account natively");
assert.match(accountScreenSource, /Switch to this account/, "APK Account screen exposes account switch action");

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
assert.doesNotMatch(mobileSource, /from ["']react-native-webview["']|<WebView\b|WebView\s+from/i, "Mobile app source does not import or render WebView");

console.log("Mobile app source tests passed.");
