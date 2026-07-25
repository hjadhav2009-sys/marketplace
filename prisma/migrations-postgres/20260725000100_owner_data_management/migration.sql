-- Additive owner-only data-management authorization and deletion lifecycle.
CREATE TABLE "OwnerActionGrant" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "actionKind" TEXT NOT NULL,
  "scopeFingerprint" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OwnerActionGrant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OwnerActionGrant_tokenHash_key" ON "OwnerActionGrant"("tokenHash");
CREATE INDEX "OwnerActionGrant_userId_sessionId_expiresAt_idx" ON "OwnerActionGrant"("userId", "sessionId", "expiresAt");
CREATE INDEX "OwnerActionGrant_expiresAt_usedAt_idx" ON "OwnerActionGrant"("expiresAt", "usedAt");

CREATE TABLE "DataDeletionJob" (
  "id" TEXT NOT NULL,
  "accountId" TEXT,
  "actorUserId" TEXT,
  "actionKind" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PREVIEWED',
  "clientRequestId" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "scopeFingerprint" TEXT NOT NULL,
  "scopeJson" TEXT NOT NULL,
  "previewJson" TEXT NOT NULL,
  "manifestJson" TEXT,
  "quarantineRelativePath" TEXT,
  "totalFiles" INTEGER NOT NULL DEFAULT 0,
  "totalBytes" INTEGER NOT NULL DEFAULT 0,
  "purgeAfter" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataDeletionJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DataDeletionJob_actorUserId_actionKind_clientRequestId_key" ON "DataDeletionJob"("actorUserId", "actionKind", "clientRequestId");
CREATE INDEX "DataDeletionJob_accountId_state_createdAt_idx" ON "DataDeletionJob"("accountId", "state", "createdAt");
CREATE INDEX "DataDeletionJob_state_purgeAfter_idx" ON "DataDeletionJob"("state", "purgeAfter");
CREATE INDEX "DataDeletionJob_scopeFingerprint_createdAt_idx" ON "DataDeletionJob"("scopeFingerprint", "createdAt");

ALTER TABLE "OwnerActionGrant" ADD CONSTRAINT "OwnerActionGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataDeletionJob" ADD CONSTRAINT "DataDeletionJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DataDeletionJob" ADD CONSTRAINT "DataDeletionJob_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
