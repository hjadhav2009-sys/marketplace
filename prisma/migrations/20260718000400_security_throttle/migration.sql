CREATE TABLE "SecurityThrottle" (
  "keyHash" TEXT NOT NULL PRIMARY KEY,
  "scope" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "windowStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "blockedUntil" DATETIME,
  "lastAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "SecurityThrottle_scope_lastAttemptAt_idx" ON "SecurityThrottle"("scope", "lastAttemptAt");
CREATE INDEX "SecurityThrottle_blockedUntil_idx" ON "SecurityThrottle"("blockedUntil");
