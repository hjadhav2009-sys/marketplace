import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testRoot = path.join(root, ".codex-tmp", `stage3-test-${process.pid}`);
process.env.STAGE3_STAGING_ROOT = testRoot;
const core = await import("../scripts/staging/core.mjs");

let assertions = 0;
async function rejects(operation, pattern) { await assert.rejects(operation, pattern); assertions += 1; }

await rm(testRoot, { recursive: true, force: true });
const beforeInspect = await core.inspect();
assert.equal(beforeInspect.database.exists, false); assertions += 1;
assert.equal(existsSync(testRoot), false); assertions += 1;
await rejects(() => core.prepare({ confirmation: "wrong" }), /exact confirmation/);
assert.equal(existsSync(testRoot), false); assertions += 1;
await rejects(() => core.reset({ confirmation: "wrong" }), /exact confirmation/);
await rejects(() => core.cleanup({ confirmation: "wrong" }), /exact confirmation/);
assert.throws(() => core.assertStagingPath(path.join(root, "prisma", "dev.db")), /escaped|protected/); assertions += 1;
assert.throws(() => core.assertStagingPath(path.join(root, "storage")), /escaped|protected/); assertions += 1;
assert.throws(() => core.assertIsolatedEnvironment({}), /DATABASE_URL/); assertions += 1;

const prepared = await core.prepare({ confirmation: core.PREPARE_PHRASE });
assert.equal(prepared.database.exists, true); assertions += 1;
assert.equal(prepared.database.integrity, "ok"); assertions += 1;
assert.equal(prepared.database.counts.Account, 4); assertions += 1;
assert.equal(prepared.database.counts.User, 10); assertions += 1;
assert.ok(prepared.database.counts.MarketplaceListing >= 12); assertions += 1;
assert.ok(prepared.database.counts.WorkTask >= 14); assertions += 1;
assert.equal(prepared.database.counts.ImportJob, 7); assertions += 1;
assert.equal(prepared.database.counts.UploadBatch, 1); assertions += 1;
assert.equal(prepared.database.counts.ImportRowIssue, 3); assertions += 1;
assert.equal(prepared.database.counts.ConsignmentImportIssue, 3); assertions += 1;
assert.equal(prepared.database.counts.ProblemOrder, 2); assertions += 1;
assert.equal(prepared.database.counts.ScanLog, 3); assertions += 1;
assert.equal(prepared.database.counts.DataDeletionJob, 3); assertions += 1;
assert.equal(prepared.database.counts.AuditLog, 2); assertions += 1;
const stagingDatabase = new DatabaseSync(core.DATABASE_PATH, { readOnly: true });
try {
  const completedMark = stagingDatabase.prepare("SELECT status, completedQuantity, requiredQuantity FROM WorkTask WHERE id = ?").get("stage4-line-mark-completed-mark");
  assert.equal(completedMark.status, "COMPLETED"); assertions += 1;
  assert.equal(completedMark.completedQuantity, 1); assertions += 1;
  assert.equal(completedMark.requiredQuantity, 1); assertions += 1;
  const completedAssembly = stagingDatabase.prepare("SELECT status, completedQuantity, requiredQuantity FROM WorkTask WHERE id = ?").get("stage4-line-assembly-completed-assemble");
  assert.equal(completedAssembly.status, "COMPLETED"); assertions += 1;
  assert.equal(completedAssembly.completedQuantity, 1); assertions += 1;
  assert.equal(completedAssembly.requiredQuantity, 1); assertions += 1;
  const lockedPack = stagingDatabase.prepare("SELECT status FROM WorkTask WHERE id = ?").get("stage4-order-pack-assembly-locked-pack");
  const pendingAssembly = stagingDatabase.prepare("SELECT status FROM WorkTask WHERE id = ?").get("stage4-order-pack-assembly-locked-assemble");
  assert.equal(lockedPack.status, "LOCKED"); assertions += 1;
  assert.equal(pendingAssembly.status, "READY"); assertions += 1;
  const openProblem = stagingDatabase.prepare("SELECT status, interruptedStage FROM ProblemOrder WHERE id = ?").get("stage4-problem-open");
  assert.equal(openProblem.status, "OPEN"); assertions += 1;
  assert.equal(openProblem.interruptedStage, "PICK"); assertions += 1;
  const completedScan = stagingDatabase.prepare("SELECT outcome FROM ScanLog WHERE id = ?").get("stage4-scan-packed");
  assert.equal(completedScan.outcome, "PACKED"); assertions += 1;
} finally {
  stagingDatabase.close();
}
assert.ok(existsSync(path.join(testRoot, "fixtures", "catalog-one.csv"))); assertions += 1;
assert.ok(existsSync(path.join(testRoot, "fixtures", "catalog-two.csv"))); assertions += 1;
assert.ok(existsSync(path.join(testRoot, "fixtures", "amazon-all-listings.csv"))); assertions += 1;
assert.ok(existsSync(path.join(testRoot, "storage", "images", "meesho", "stage3-account-fk-01", "stage3-fk-gallery", "card.png"))); assertions += 1;
assert.ok(existsSync(core.CREDENTIAL_PATH)); assertions += 1;
const credentials = JSON.parse(readFileSync(core.CREDENTIAL_PATH, "utf8"));
assert.equal(credentials.users.length, 10); assertions += 1;
assert.equal(new Set(credentials.users.map((item) => item.password)).size, 10); assertions += 1;
assert.ok(credentials.users.every((item) => item.username.startsWith("stage3-") && !/customer|buyer|address/i.test(JSON.stringify(item)))); assertions += 1;
await rejects(() => core.prepare({ confirmation: core.PREPARE_PHRASE }), /already exists/);

const oldPasswords = credentials.users.map((item) => item.password);
const resetResult = await core.reset({ confirmation: core.RESET_PHRASE });
assert.equal(resetResult.database.counts.User, 10); assertions += 1;
const rotated = JSON.parse(readFileSync(core.CREDENTIAL_PATH, "utf8"));
assert.ok(rotated.users.every((item, index) => item.password !== oldPasswords[index])); assertions += 1;
assert.equal((await core.inspect()).portOpen, false); assertions += 1;

const source = readFileSync(path.join(root, "scripts", "staging", "core.mjs"), "utf8");
assert.match(source, /-H", HOST/); assertions += 1;
assert.match(source, /refusing to kill/i); assertions += 1;
assert.match(source, /cloudflare\|tailscale/); assertions += 1;
assert.match(source, /current-build\.json/); assertions += 1;
assert.match(source, /buildReceipt\.sourceSha !== sourceSha/); assertions += 1;
assert.match(source, /buildReceipt\.buildId !== buildId/); assertions += 1;
assert.match(source, /sourceSha,\s*buildId,\s*commandFingerprint/); assertions += 1;
assert.doesNotMatch(source, /resolveRealDatabasePath|real-db\/|fresh-db:reset/); assertions += 1;
const middleware = readFileSync(path.join(root, "middleware.ts"), "utf8");
assert.match(middleware, /SESSION_COOKIE_NAME/); assertions += 1;
const identityRoute = readFileSync(path.join(root, "app", "api", "staging", "identity", "route.ts"), "utf8");
assert.match(identityRoute, /STAGE3_SYNTHETIC_STAGING[\s\S]*status: 404/); assertions += 1;
const scenarios = readFileSync(path.join(root, "scripts", "qa", "stage4-5-scenarios.mjs"), "utf8");
assert.match(scenarios, /SCANNER_COMPLETED", "\/work\/scan\?q=STAGE-AWB-10"/); assertions += 1;
assert.match(scenarios, /MARK_COMPLETED", "\/work\/consignments\/items\/stage4-line-mark-completed-mark"/); assertions += 1;
assert.match(scenarios, /ASSEMBLY_COMPLETED", "\/work\/consignments\/items\/stage4-line-assembly-completed-assemble"/); assertions += 1;
assert.match(scenarios, /PACK_ASSEMBLY_LOCKED", "\/packing\/STAGE-AWB-ASSEMBLY-LOCKED"/); assertions += 1;
assert.match(scenarios, /PROBLEM_OPEN", "\/problems\?tab=open"/); assertions += 1;
const capture = readFileSync(path.join(root, "scripts", "qa", "stage4-5-capture.mjs"), "utf8");
assert.match(capture, /assertScenarioTruth/); assertions += 1;
assert.match(capture, /temporarilyDeactivateSyntheticAccounts/); assertions += 1;
assert.match(capture, /No seller accounts have been created yet/); assertions += 1;
const cleaned = await core.cleanup({ confirmation: core.CLEANUP_PHRASE });
assert.equal(cleaned.cleaned, true); assertions += 1;
assert.equal(existsSync(testRoot), false); assertions += 1;

console.log(`Stage 3 staging safety tests passed (${assertions} assertions).`);
