CREATE TABLE "SecurityThrottle" (
  "keyHash" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "blockedUntil" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SecurityThrottle_pkey" PRIMARY KEY ("keyHash")
);
CREATE INDEX "SecurityThrottle_scope_lastAttemptAt_idx" ON "SecurityThrottle"("scope", "lastAttemptAt");
CREATE INDEX "SecurityThrottle_blockedUntil_idx" ON "SecurityThrottle"("blockedUntil");
