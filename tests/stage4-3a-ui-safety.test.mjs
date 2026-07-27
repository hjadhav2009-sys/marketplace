import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");
const login = read("app/login/page.tsx");
const password = read("app/login/PasswordField.tsx");
const shell = read("components/AppShell.tsx");
const accountMenu = read("components/MobileAccountMenu.tsx");
const card = read("app/work/GroupedWorkCard.tsx");
const routeDialog = read("components/WorkRouteDialog.tsx");
const auth = read("lib/auth.ts");
const accessDenied = read("app/access-denied/page.tsx");

for (const invariant of [
  /action=\{loginAction\}/,
  /name="username"/,
  /autoComplete="username"/,
  /required/,
  /hasSetupComplete/,
  /hasPasswordChangedMessage/,
  /hasExpiredMessage/,
  /hasInvalidError/,
  /hasSessionError/,
  /href="\/forgot-password"/,
  /SubmitButton/,
]) assert.match(login, invariant);
assert.match(password, /name="password"/);
assert.match(password, /autoComplete="current-password"/);
assert.match(password, /type=\{visible \? "text" : "password"\}/);
assert.match(password, /type="button"/);

for (const invariant of [
  /requireUser\(\)/,
  /requireAccount\(user\)/,
  /getSelectedAccount\(user\)/,
  /recordAuditLog/,
  /clearSession\(\)/,
  /redirect\("\/login"\)/,
  /linksForUser\(user\)/,
  /capabilityHomePath\(user\)/,
]) assert.match(shell, invariant);
assert.match(accountMenu, /href="\/accounts"/);
assert.match(accountMenu, /action=\{logoutAction\}/);
assert.match(accountMenu, /event\.key === "Escape"/);
assert.match(accountMenu, /pointerdown/);
assert.doesNotMatch(shell, /<MobileBottomNav/);
assert.match(auth, /roles && !roles\.includes\(user\.role\)[\s\S]*redirect\("\/access-denied"\)/);
assert.match(accessDenied, /No protected page information was loaded/);
assert.match(accessDenied, /Open permitted workspace/);
assert.match(accessDenied, /href="\/accounts"/);

for (const field of ["stage", "sourceType", "groupKey", "groupVersion", "clientRequestId"]) {
  assert.match(card, new RegExp(`name="${field}"`));
}
assert.match(card, /completeGroupedStageAction/);
assert.match(card, /canAct/);
assert.match(card, /work-change/);
assert.match(card, /WorkRouteDialog/);
for (const field of ["nextStage", "useRecommended", "routeReason", "routeOtherReason", "confirmMissingInstructions", "workerNote"]) {
  assert.match(routeDialog, new RegExp(`name="${field}"`));
}

console.log("Stage 4.3A authentication, navigation, and grouped-action wiring invariants passed.");
