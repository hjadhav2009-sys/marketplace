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
assert.ok(getMobileTabs(owner.role, getMobilePermissions(owner)).includes("admin"), "Owner sees admin tab");

const homeSource = read("mobile-app", "src", "screens", "HomeScreen.tsx");
const productCardSource = read("mobile-app", "src", "components", "ProductCard.tsx");
const pickerSource = read("mobile-app", "src", "screens", "PickerScreen.tsx");
const packingSource = read("mobile-app", "src", "screens", "PackingScreen.tsx");
const gallerySource = read("mobile-app", "src", "screens", "ProductGalleryScreen.tsx");
const detailsSource = read("mobile-app", "src", "screens", "ProductDetailsScreen.tsx");

assert.match(homeSource, /user\.tabs/, "APK bottom nav uses /api/mobile/me tabs");
assert.match(homeSource, /DashboardScreen/, "Owner dashboard screen is wired");
assert.match(productCardSource, /mobileTheme\.imageSquare/, "Product card uses shared square image style");
assert.match(pickerSource, /markPicked/, "Picker card has Picked action");
assert.match(pickerSource, /setItems\(nextItems\)/, "APK has optimistic Picked flow");
assert.match(packingSource, /packStatus: "PACKING"/, "APK has optimistic Pack flow");
assert.ok(packingSource.indexOf("placeholder=\"FMPC0000000000\"") < packingSource.indexOf("Scan barcode"), "Packing manual search comes before scanner");
assert.match(gallerySource, /getProductImages/, "Gallery fetches images from image screen only");
assert.match(detailsSource, /getProductDetails/, "Details fetches product details from details screen only");

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

console.log("Mobile app source tests passed.");
