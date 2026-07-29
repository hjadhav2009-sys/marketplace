import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");

const shell = read("components/AppShell.tsx");
const coordinator = read("components/MobileOverlayCoordinator.tsx");
const navigation = read("components/AppNav.tsx");
const accountMenu = read("components/MobileAccountMenu.tsx");
const groupedCard = read("app/work/GroupedWorkCard.tsx");
const gallery = read("components/WorkImageGallery.tsx");
const scanner = read("components/UniversalScannerPanel.tsx");
const dataManagement = read("app/owner/data-management/page.tsx");
const dataActionDetails = read("components/DataActionDetails.tsx");

assert.match(shell, /<MobileOverlayCoordinator>/, "The two mobile menus must share one overlay boundary.");
assert.match(coordinator, /"navigation" \| "account" \| null/, "Only one mobile overlay can be active.");
assert.match(coordinator, /activeOverlay !== "navigation"/, "Body locking is limited to the navigation drawer.");
assert.match(coordinator, /popstate/, "Browser history navigation closes mobile overlays.");
assert.match(navigation, /h-dvh max-h-dvh/, "The mobile drawer is bounded to the dynamic viewport.");
assert.match(navigation, /min-h-0 flex-1 overflow-y-auto overscroll-contain/, "Only the authorized navigation list scrolls.");
assert.match(navigation, /triggerRef\.current\?\.focus/, "Closing the drawer restores trigger focus.");
assert.match(accountMenu, /useMobileOverlayCoordinator/, "The account menu participates in shared overlay state.");
assert.match(accountMenu, /triggerRef\.current\?\.focus/, "Escape from the account menu restores trigger focus.");

assert.match(gallery, /compact \? "work" : "lg"/, "Worker cards use the compact image fallback.");
assert.match(groupedCard, /data-action-mode="problem"/, "Problem work has a distinct action state.");
assert.match(groupedCard, /Work paused — an open problem must be resolved/, "Problem work explains why processing is paused.");
assert.match(groupedCard, />Open Problem</, "Problem work links to its review surface.");
assert.match(groupedCard, /data-action-mode="read-only"/, "Read-only work has a distinct action state.");
assert.match(groupedCard, /current permissions do not allow/, "Read-only work explains the exact capability boundary.");
assert.match(groupedCard, /Marking Completed/, "Mark actions retain their supported completion label.");
assert.match(groupedCard, /Assembly Completed/, "Assembly actions retain their supported completion label.");

assert.match(scanner, /lg:grid-cols-\[360px_minmax\(0,1fr\)\]/, "Desktop scanner controls remain a bounded column.");
assert.match(scanner, /data-scanner-workflow/, "Scanner workflow status has a stable layout region.");
assert.match(scanner, /data-scanner-actions/, "Scanner actions have a stable layout region.");
assert.match(scanner, /Customer Order — Pick pending/, "Order Pick candidates identify their action scope.");
assert.match(scanner, /package — \$\{candidate\.canAct \? "Pack ready" : "Pack locked"\}/, "Package candidates explain their distinct Pack scope.");
assert.match(scanner, /Lookup completed in/, "Lookup timing has an explicit readable label.");

for (const tone of ["quarantine", "archive", "restore", "permanent"]) {
  assert.match(dataManagement + dataActionDetails, new RegExp(`"${tone}"`), `Data Management exposes the ${tone} hierarchy.`);
}
assert.match(dataActionDetails, /event\.key !== "Escape"/, "Escape closes an expanded Data Management action.");
assert.match(dataActionDetails, />\s*Cancel\s*</, "Every expanded Data Management action has a visible Cancel control.");
assert.match(dataActionDetails, /summaryRef\.current\?\.focus/, "Closing a Data Management action restores focus.");
assert.match(dataManagement, /executeOwnerDataAction/, "The existing authoritative Data Management action remains wired.");

console.log("Stage 4.6A visual interaction source invariants passed.");
