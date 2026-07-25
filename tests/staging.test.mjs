import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const cleaned = await core.cleanup({ confirmation: core.CLEANUP_PHRASE });
assert.equal(cleaned.cleaned, true); assertions += 1;
assert.equal(existsSync(testRoot), false); assertions += 1;

console.log(`Stage 3 staging safety tests passed (${assertions} assertions).`);
