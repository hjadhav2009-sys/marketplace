import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nextMenuIndex } from "../components/MobileAccountMenu";
import { normalizeNavigationPath, resolveCurrentNavigationId } from "../components/appNavigation";
import { navigationForUser, ownerNavigation, type NavigationUser } from "../lib/app-navigation";

const read = (file: string) => readFileSync(file, "utf8");
const defaults: NavigationUser = {
  role: "PICKER",
  canPick: false,
  canPack: false,
  canReportProblem: false,
  canMark: false,
  canAssemble: false,
  canManageMarkingLibrary: false,
  canManageProcessRules: false,
  canViewAllWork: false,
  canViewConsignments: false,
  canImportConsignments: false,
  canManageConsignments: false,
};
const user = (permissions: Partial<NavigationUser> = {}): NavigationUser => ({ ...defaults, ...permissions });
const hrefs = (permissions: Partial<NavigationUser> = {}) => navigationForUser(user(permissions)).map((link) => link.href);
const sorted = (values: readonly string[]) => [...values].sort();

const legacyOwnerHrefs = [
  "/dashboard", "/work", "/owner/product-inventory", "/owner/catalog/missing", "/owner/process-rules",
  "/owner/marking-library", "/owner/product-inventory/refresh", "/owner/imports", "/owner/consignments",
  "/work/pick?source=ORDER", "/work/mark", "/work/assemble", "/work/pack", "/work/scan", "/work/problems",
  "/owner/work-route-summary", "/owner/accounts", "/owner/users", "/reports", "/owner/system",
  "/owner/data-management", "/change-password",
];
assert.deepEqual(sorted(navigationForUser(user({ role: "OWNER" })).map((link) => link.href)), sorted(legacyOwnerHrefs), "Owner href authorization is unchanged from B1b.");

const legacyWorkerSets: Array<[string, Partial<NavigationUser>, string[]]> = [
  ["picker", { canPick: true, canReportProblem: true }, ["/work", "/work/scan", "/work/pick?source=ORDER", "/work/consignments/pick", "/work/problems", "/change-password"]],
  ["marker", { canMark: true, canReportProblem: true }, ["/work", "/work/scan", "/work/marking", "/work/problems", "/change-password"]],
  ["assembler", { canAssemble: true, canReportProblem: true }, ["/work", "/work/scan", "/work/assembly", "/work/problems", "/change-password"]],
  ["packer", { role: "PACKER", canPack: true, canReportProblem: true }, ["/work", "/work/scan", "/packing", "/work/consignments/pack", "/work/problems", "/change-password"]],
  ["pick-and-pack", { canPick: true, canPack: true, canReportProblem: true }, ["/work", "/work/scan", "/work/pick?source=ORDER", "/work/consignments/pick", "/packing", "/work/consignments/pack", "/work/problems", "/change-password"]],
  ["view-all", { canViewAllWork: true, canViewConsignments: true }, ["/work", "/work/scan", "/work/assembly", "/work/problems", "/owner/consignments", "/change-password"]],
  ["import-manager", { canImportConsignments: true, canManageConsignments: true, canViewConsignments: true }, ["/work/problems", "/owner/consignments", "/change-password"]],
  ["no-capability", {}, ["/change-password"]],
];
for (const [label, permissions, expected] of legacyWorkerSets) {
  assert.deepEqual(sorted(hrefs(permissions)), sorted(expected), `${label} keeps the exact B1b authorized href set.`);
}

assert.equal(normalizeNavigationPath("/work/pick?source=ORDER#queue"), "/work/pick");
assert.equal(normalizeNavigationPath("https://example.test/owner/imports/job/mapping?step=2"), "/owner/imports/job/mapping");
for (const [pathname, expected] of [
  ["/work", "work-hub"],
  ["/work/pick", "pick"],
  ["/work/pick/stage3-group", "pick"],
  ["/work/mark", "mark"],
  ["/owner/product-inventory/stage3-listing", "product-inventory"],
  ["/owner/product-inventory/refresh", "new-import"],
  ["/owner/imports/stage4-import/mapping", "import-history"],
  ["/owner/consignments/stage3-batch/review", "consignments"],
  ["/owner", "dashboard"],
  ["/workshop", null],
  ["/unowned/route", null],
] as const) {
  assert.equal(resolveCurrentNavigationId(pathname, ownerNavigation), expected, `${pathname} has one explicit navigation owner.`);
}

const ownerSections = [...new Set(ownerNavigation.map((link) => link.section))];
assert.deepEqual(ownerSections, ["OVERVIEW", "WORK", "CATALOG", "IMPORTS", "PEOPLE", "INSIGHTS & SYSTEM", "PROFILE"]);
assert.equal(new Set(ownerNavigation.map((link) => link.href)).size, ownerNavigation.length, "Owner navigation has no duplicate hrefs.");
assert.equal(new Set(ownerNavigation.map((link) => link.id)).size, ownerNavigation.length, "Stable navigation IDs are unique.");
for (const permissions of legacyWorkerSets.map((entry) => entry[1])) {
  const links = navigationForUser(user(permissions));
  assert.equal(new Set(links.map((link) => link.href)).size, links.length, "Worker navigation has no duplicate hrefs.");
  assert.ok(links.every((link) => ["WORK", "MANAGE", "PROFILE"].includes(link.section)), "Workers receive only meaningful non-empty groups.");
}

assert.equal(nextMenuIndex(0, 3, "ArrowDown"), 1);
assert.equal(nextMenuIndex(2, 3, "ArrowDown"), 0);
assert.equal(nextMenuIndex(0, 3, "ArrowUp"), 2);
assert.equal(nextMenuIndex(1, 3, "Home"), 0);
assert.equal(nextMenuIndex(1, 3, "End"), 2);
assert.equal(nextMenuIndex(1, 3, "Escape"), null);

const shell = read("components/AppShell.tsx");
const nav = read("components/AppNav.tsx");
const coordinator = read("components/MobileOverlayCoordinator.tsx");
const accountMenu = read("components/MobileAccountMenu.tsx");
const pageHeader = read("components/PageHeader.tsx");
const seed = read("scripts/staging/seed.ts");
const workSourceTabs = read("app/work/LiveStageSummary.tsx");
const dataManagement = read("app/owner/data-management/page.tsx");

assert.match(shell, /navigationForUser\(user\)/, "Permission-derived links are still created by the Server Component shell.");
assert.doesNotMatch(nav, /canPick|canPack|canMark|canAssemble|canViewAllWork/, "The client navigation never receives permission computation.");
assert.match(nav, /resolveCurrentNavigationId\(pathname, links\)/, "One central resolver owns current-route state.");
assert.match(nav, /aria-current=\{active && ownsCurrentRoute \? "page" : undefined\}/);
assert.doesNotMatch(workSourceTabs, /aria-current/, "Work-source tabs use aria-selected without claiming page-route ownership.");
assert.match(dataManagement, /aria-current=\{tab===key\?"true":undefined\}/, "In-page Data Management navigation does not claim page-route ownership.");
assert.match(nav, /const \[desktopShell, setDesktopShell\] = useState\(false\)/);
assert.match(nav, /query\.addEventListener\("change", update\)/);
assert.match(nav, /min-width: 1280px/);
assert.match(nav, /idPrefix="desktop"/);
assert.match(nav, /idPrefix="mobile"/, "Desktop and drawer navigation headings keep distinct IDs.");
assert.match(nav, /xl:flex/);
assert.match(nav, /xl:hidden/);
assert.match(nav, /min-h-11 min-w-11/, "Shell controls preserve 44px operational targets.");
assert.match(nav, /requestAnimationFrame\(\(\) => closeRef\.current\?\.focus\(\)\)/, "Drawer focus enters on the Close control.");
assert.match(nav, /event\.key !== "Tab"/);
assert.match(nav, /event\.shiftKey/);
assert.match(nav, /restoreFocusRef/, "Drawer close paths deliberately manage focus return.");
assert.match(coordinator, /"navigation" \| "account" \| null/, "Only one overlay can be open.");
assert.match(coordinator, /shellBackground\.inert = true/);
assert.match(coordinator, /shellBackground\.inert = wasInert/);
assert.match(coordinator, /document\.body\.style\.overflow = "hidden"/);
assert.match(coordinator, /popstate/);
for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Escape"]) assert.match(accountMenu, new RegExp(key));
assert.match(accountMenu, /menuItems\(\)\[0\]\?\.focus\(\)/, "Account menu focuses its first action on open.");
assert.match(accountMenu, /triggerRef\.current\?\.focus\(\)/, "Escape returns account-menu focus.");
assert.match(accountMenu, /action=\{logoutAction\}/, "Logout remains the original server action.");
assert.match(pageHeader, /buttonStyles\(\{ variant: "primary" \}\)/, "PageHeader reuses the B1 action contract.");
assert.match(pageHeader, /break-words/, "PageHeader contains long titles and descriptions.");
assert.match(seed, /Synthetic Pick \+ Pack Worker/);
assert.match(seed, /Synthetic No-Account Worker/);
assert.match(seed, /Synthetic No-Account Owner/);
assert.match(shell, /No seller account selected[\s\S]*Create or choose an account/);
assert.match(shell, /No assigned seller account[\s\S]*Ask the owner to assign an account/);

console.log("Phase 7.4B2 application-shell source and navigation invariants passed.");
