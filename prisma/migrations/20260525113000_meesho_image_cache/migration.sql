ALTER TABLE "SkuImageMapping" ADD COLUMN "size" TEXT;
ALTER TABLE "SkuImageMapping" ADD COLUMN "cacheStatus" TEXT NOT NULL DEFAULT 'NOT_CACHED';
ALTER TABLE "SkuImageMapping" ADD COLUMN "cacheFilePath" TEXT;
ALTER TABLE "SkuImageMapping" ADD COLUMN "cacheContentType" TEXT;
ALTER TABLE "SkuImageMapping" ADD COLUMN "cacheOriginalImageUrl" TEXT;
ALTER TABLE "SkuImageMapping" ADD COLUMN "cacheCachedAt" DATETIME;
ALTER TABLE "SkuImageMapping" ADD COLUMN "cacheLastUsedAt" DATETIME;
ALTER TABLE "SkuImageMapping" ADD COLUMN "cacheWidth" INTEGER;
ALTER TABLE "SkuImageMapping" ADD COLUMN "cacheHeight" INTEGER;
ALTER TABLE "SkuImageMapping" ADD COLUMN "cacheFileSizeBytes" INTEGER;
ALTER TABLE "SkuImageMapping" ADD COLUMN "cacheError" TEXT;

CREATE INDEX "SkuImageMapping_accountId_cacheStatus_idx" ON "SkuImageMapping"("accountId", "cacheStatus");
CREATE INDEX "SkuImageMapping_cacheLastUsedAt_idx" ON "SkuImageMapping"("cacheLastUsedAt");
