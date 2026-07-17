import assert from "node:assert/strict";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { clearSecurityAttempt, clearSecurityDimensions, consumeSecurityAttempt, consumeSecurityDimensions, pruneSecurityThrottles } from "../lib/security-throttle";

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
  await consumeSecurityDimensions({scope:"shared-login",username:"user-a",ipAddress:"192.0.2.10",usernameLimit:5,ipLimit:5,windowMs:60_000,blockMs:60_000},db);await consumeSecurityDimensions({scope:"shared-login",username:"user-b",ipAddress:"192.0.2.10",usernameLimit:5,ipLimit:5,windowMs:60_000,blockMs:60_000},db);await clearSecurityDimensions("shared-login","user-a",db);assert.equal(await db.securityThrottle.count({where:{scope:"shared-login:ip"}}),1,"A successful login clears only that username and preserves the shared IP bucket");assert.equal(await db.securityThrottle.count({where:{scope:"shared-login:username"}}),1);
  await consumeSecurityDimensions({scope:"unknown-ip-login",username:"user-c",usernameLimit:5,ipLimit:1,windowMs:60_000,blockMs:60_000},db);await consumeSecurityDimensions({scope:"unknown-ip-login",username:"user-d",usernameLimit:5,ipLimit:1,windowMs:60_000,blockMs:60_000},db);assert.equal(await db.securityThrottle.count({where:{scope:"unknown-ip-login:ip"}}),0,"Missing proxy IP never creates one global unknown-IP bucket");
  await db.securityThrottle.updateMany({ data: { lastAttemptAt: new Date(0), blockedUntil: null } });
  assert.ok((await pruneSecurityThrottles(new Date(1), db)).count>=1);assert.equal(await db.securityThrottle.count(),0,"All eligible expired throttle dimensions are pruned");
} finally {
  await cleanup();
}
console.log("Durable security throttle concurrency and retention tests passed.");
