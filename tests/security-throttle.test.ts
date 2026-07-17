import assert from "node:assert/strict";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { clearSecurityAttempt, consumeSecurityAttempt, pruneSecurityThrottles } from "../lib/security-throttle";

const { db, cleanup } = createTempWorkflowDb("security-throttle");
try {
  const attempts = await Promise.all(Array.from({ length: 5 }, () => consumeSecurityAttempt({ scope: "synthetic-login", identity: "worker@example.invalid", limit: 3, windowMs: 60_000, blockMs: 60_000 }, db)));
  assert.equal(attempts.filter(item => item.allowed).length, 3, "Concurrent attempts consume one durable counter each");
  assert.equal(attempts.filter(item => !item.allowed).length, 2);
  const stored = await db.securityThrottle.findFirstOrThrow({ where: { scope: "synthetic-login" } });
  assert.equal(stored.attempts, 4, "Once blocked, later callers observe the block without unbounded growth");
  assert.ok(stored.blockedUntil);
  await clearSecurityAttempt("synthetic-login", "worker@example.invalid", db);
  assert.equal((await consumeSecurityAttempt({ scope: "synthetic-login", identity: "worker@example.invalid", limit: 3, windowMs: 60_000, blockMs: 60_000 }, db)).allowed, true);
  await db.securityThrottle.updateMany({ data: { lastAttemptAt: new Date(0), blockedUntil: null } });
  assert.equal((await pruneSecurityThrottles(new Date(1), db)).count, 1);
} finally {
  await cleanup();
}
console.log("Durable security throttle concurrency and retention tests passed.");
