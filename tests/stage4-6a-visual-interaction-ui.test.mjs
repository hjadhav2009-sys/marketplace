import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");

const shell = read("components/AppShell.tsx");
const rootLayout = read("app/layout.tsx");
const coordinator = read("components/MobileOverlayCoordinator.tsx");
const navigation = read("components/AppNav.tsx");
const accountMenu = read("components/MobileAccountMenu.tsx");
const groupedCard = read("app/work/GroupedWorkCard.tsx") + read("components/work-card/GroupedQuickActions.tsx") + read("components/work-card/WorkCardSections.tsx");
const gallery = read("components/WorkImageGallery.tsx");
const scanner = read("components/UniversalScannerPanel.tsx");
const dataManagement = read("app/owner/data-management/page.tsx");
const dataActionDetails = read("components/DataActionDetails.tsx");
const importProgress = read("components/ImportJobProgress.tsx");
const importDetails = read("app/owner/imports/[jobId]/page.tsx");
const dashboard = read("app/dashboard/page.tsx");
const uploadReview = read("app/owner/uploads/[batchId]/review/page.tsx");
const consignmentDetails = read("app/owner/consignments/[batchId]/page.tsx");
const consignmentReview = read("app/owner/consignments/[batchId]/review/page.tsx");
const consignmentIssues = read("app/owner/consignments/[batchId]/issues/page.tsx");
const atlasCapture = read("scripts/qa/stage4-5-capture.mjs");

assert.match(shell, /<MobileOverlayCoordinator>/, "The two mobile menus must share one overlay boundary.");
assert.match(coordinator, /"navigation" \| "account" \| null/, "Only one mobile overlay can be active.");
assert.match(coordinator, /activeOverlay !== "navigation"/, "Body locking is limited to the navigation drawer.");
assert.match(coordinator, /popstate/, "Browser history navigation closes mobile overlays.");
assert.match(navigation, /h-dvh max-h-dvh/, "The mobile drawer is bounded to the dynamic viewport.");
assert.match(navigation, /min-h-0 flex-1 overflow-y-auto overscroll-contain/, "Only the authorized navigation list scrolls.");
assert.match(navigation, /createPortal\(/, "The fixed drawer escapes the filtered sticky-header containing block.");
assert.match(navigation, /data-mobile-drawer-backdrop/, "The full-viewport backdrop has a stable interaction boundary.");
assert.match(navigation, /triggerRef\.current\?\.focus/, "Closing the drawer restores trigger focus.");
assert.match(navigation, /href="\/dashboard"[\s\S]{0,120}className="flex min-h-11 min-w-0 flex-col justify-center"/, "The desktop sidebar home link provides a 44px target.");
assert.match(rootLayout, /zIndex:\s*40/, "The synthetic staging banner stays below the z-50 mobile drawer.");
assert.match(accountMenu, /useMobileOverlayCoordinator/, "The account menu participates in shared overlay state.");
assert.match(accountMenu, /triggerRef\.current\?\.focus/, "Escape from the account menu restores trigger focus.");
assert.match(rootLayout, /icons:\s*\{[\s\S]*\/icon\.svg/, "The browser favicon is declared explicitly instead of falling back to a missing /favicon.ico.");
assert.match(shell, /className="flex min-h-11 min-w-0 flex-1 flex-col justify-center xl:hidden"/, "The app-shell account/home link provides a 44px target.");

assert.match(gallery, /compact \? "work" : "lg"/, "Worker cards use the compact image fallback.");
assert.match(groupedCard, /WorkCardActions mode="problem"/, "Problem work has a distinct action state.");
assert.match(groupedCard, /Work paused[\s\S]*open problem must be resolved/, "Problem work explains why processing is paused.");
assert.match(groupedCard, /"Open Problem"/, "Problem work opens its review surface.");
assert.match(groupedCard, /WorkCardActions mode="read-only"/, "Read-only work has a distinct action state.");
assert.match(groupedCard, /current permissions do not allow/, "Read-only work explains the exact capability boundary.");
assert.match(groupedCard, /Marking Completed/, "Mark actions retain their supported completion label.");
assert.match(groupedCard, /Assembly Completed/, "Assembly actions retain their supported completion label.");

assert.match(scanner, /lg:grid-cols-\[360px_minmax\(0,1fr\)\]/, "Desktop scanner controls remain a bounded column.");
assert.match(scanner, /data-scanner-workflow/, "Scanner workflow status has a stable layout region.");
assert.match(scanner, /data-scanner-actions/, "Scanner actions have a stable layout region.");
assert.match(scanner, /Customer Order — Pick pending/, "Order Pick candidates identify their action scope.");
assert.match(scanner, /package — \$\{candidate\.canAct \? "Pack ready" : "Pack locked"\}/, "Package candidates explain their distinct Pack scope.");
assert.match(scanner, /Lookup completed in/, "Lookup timing has an explicit readable label.");
assert.match(scanner, /visibleCompletedResults/, "Completed Scanner cards are counted separately from active work.");
assert.match(scanner, /completed read-only result\(s\)/, "The Scanner summary labels completed matches as read-only.");

for (const tone of ["quarantine", "archive", "restore", "permanent"]) {
  assert.match(dataManagement + dataActionDetails, new RegExp(`"${tone}"`), `Data Management exposes the ${tone} hierarchy.`);
}
assert.match(dataActionDetails, /event\.key !== "Escape"/, "Escape closes an expanded Data Management action.");
assert.match(dataActionDetails, />\s*Cancel\s*</, "Every expanded Data Management action has a visible Cancel control.");
assert.match(dataActionDetails, /summaryRef\.current\?\.focus/, "Closing a Data Management action restores focus.");
assert.match(dataManagement, /executeOwnerDataAction/, "The existing authoritative Data Management action remains wired.");

for (const [source, pattern, label] of [
  [dashboard, /href="\/owner\/imports" className=\{buttonStyles\(\{ variant: "quiet" \}\)\}/, "dashboard section link"],
  [importProgress, /inline-flex min-h-11 items-center rounded-md/, "import progress actions"],
  [importDetails, /View issues[\s\S]*Download issues[\s\S]*min-h-11/, "import detail actions"],
  [uploadReview, /inline-flex min-h-11 items-center text-sm font-semibold text-berry/, "upload review actions"],
  [consignmentDetails, /inline-flex min-h-11 items-center rounded-md border px-4 py-2 font-bold/, "consignment detail actions"],
  [consignmentReview, /inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full/, "consignment review filters"],
  [consignmentIssues, /min-h-11 rounded-md bg-slate-950 px-4 font-bold text-white/, "consignment issue filter"],
]) {
  assert.match(source, pattern, `${label} retain at least a 44px operational target.`);
}
assert.match(atlasCapture, /control\.width < 44 \|\| control\.height < 44/, "Atlas verification rejects undersized width or height.");
assert.doesNotMatch(atlasCapture, /favicon\\\.ico/, "Atlas verification does not hide favicon failures.");

console.log("Stage 4.6A visual interaction source invariants passed.");
