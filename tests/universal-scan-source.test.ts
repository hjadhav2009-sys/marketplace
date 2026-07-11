import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const resolver = read("src/lib/workflow/universal-resolver.ts");
const actions = read("src/lib/workflow/universal-actions.ts");
const panel = read("components/UniversalScannerPanel.tsx");
const packing = read("app/packing/page.tsx");
const shell = read("components/AppShell.tsx");
const hub = read("app/work/page.tsx");
const taskStore = read("src/lib/workflow/task-store.ts");
const schema = read("prisma/schema.prisma");

assert.match(resolver, /getAuthorizedWorkAccounts/);
assert.match(resolver, /resolveUniversalWork/);
assert.doesNotMatch(resolver, /contains:/, "Scan resolver must not use fuzzy contains matching");
assert.match(resolver, /take:limit\*4/, "Resolver result loading is bounded");
assert.match(resolver, /WORK_TASK_ID/);
assert.match(resolver, /markingFileAvailable/);
assert.doesNotMatch(resolver, /managedRelativePath|passwordHash|DATABASE_URL|SESSION_SECRET/);
assert.match(panel, /Scanning never changes work/);
assert.match(panel, /All authorized accounts/);
assert.match(panel, /No action was performed/);
assert.match(packing, /UniversalScannerPanel/);
assert.match(actions, /getAuthorizedWorkAccounts/);
assert.match(actions, /This account is no longer assigned to you/);
assert.match(shell, /canManageConsignments|canViewAllWork/);
assert.match(hub, /canManageConsignments|canViewAllWork/);
assert.match(taskStore, /recoverIdempotentReplay/);
assert.match(taskStore, /Request ID was already used with a different payload/);
assert.match(schema, /identifierType, normalizedValue, accountId/);
assert.doesNotMatch(schema, /model\s+(Inventory|StockLedger|StockBalance)/);

console.log("Universal scanner source policy tests passed.");
