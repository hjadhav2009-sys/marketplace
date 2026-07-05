import packageJson from "../package.json";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sessionCookieSecurityDiagnostics } from "./auth-helpers";
import { productImageCacheRoot } from "./image-cache";
import { prisma } from "./prisma";
import { runProductionChecks, summarizeProductionChecks } from "./production-checks";
import { cleanupCutoffs } from "./cleanup";
import { normalizeSkuForMatching } from "./sku";

export type SystemHealth = Awaited<ReturnType<typeof getSystemHealth>>;

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function normalizedDatabaseUrl() {
  let value = String(process.env.DATABASE_URL ?? "").trim().replace(/^['"]|['"]$/g, "");

  if (value.startsWith("DATABASE_URL=")) {
    value = value.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
  }

  return value;
}

function migrationDirectory() {
  const databaseUrl = normalizedDatabaseUrl();

  return databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")
    ? join(process.cwd(), "prisma", "migrations-postgres")
    : join(process.cwd(), "prisma", "migrations");
}

function localMigrationNames() {
  const dir = migrationDirectory();

  if (!existsSync(dir)) {
    return [] as string[];
  }

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

async function getMigrationStatus() {
  try {
    const localNames = localMigrationNames();
    const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'
    );
    const appliedNames = new Set(rows.map((row) => row.migration_name));

    return {
      pendingMigrationCount: localNames.filter((name) => !appliedNames.has(name)).length,
      migrationCheckError: null
    };
  } catch (error) {
    return {
      pendingMigrationCount: null,
      migrationCheckError: error instanceof Error ? error.message : "Unknown migration status error"
    };
  }
}

export async function getSystemHealth() {
  const today = startOfToday();
  const cutoffs = cleanupCutoffs();
  const authCookie = sessionCookieSecurityDiagnostics();

  let databaseConnected = true;
  let databasePingMs: number | null = null;

  try {
    const pingStartedAt = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    databasePingMs = Date.now() - pingStartedAt;
  } catch {
    databaseConnected = false;
  }

  if (!databaseConnected) {
    const imageCacheRootExists = existsSync(productImageCacheRoot());
    const productionChecks = runProductionChecks({
      nodeEnv: process.env.NODE_ENV,
      sessionSecret: process.env.SESSION_SECRET,
      nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL,
      databaseUrl: process.env.DATABASE_URL,
      localNetworkOnly: process.env.LOCAL_NETWORK_ONLY,
      databasePingMs,
      imageCacheRootExists,
      pendingMigrationCount: null,
      migrationCheckError: "Database connection failed."
    });

    return {
      appName: "Marketplace Pick & Pack",
      version: packageJson.version,
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
      authCookie,
      databasePingMs,
      databaseConnected,
      activeAccountCount: 0,
      activeUserCount: 0,
      todayUploadedBatches: 0,
      todayImportedOrders: 0,
      todayPackedOrders: 0,
      todayScanCount: 0,
      openProblemOrders: 0,
      missingImageSkuCount: 0,
      brokenImageUrlCount: 0,
      uploadPreviewRowCount: 0,
      importRowIssueCount: 0,
      scanLogCount: 0,
      auditLogCount: 0,
      oldPreviewRowCount: 0,
      oldImportIssueCount: 0,
      oldScanLogCount: 0,
      oldAuditLogCount: 0,
      imageCacheRootExists,
      pendingMigrationCount: null,
      migrationCheckError: "Database connection failed.",
      productionChecks,
      overallStatus: "NEEDS_ACTION" as const
    };
  }

  const [
    activeAccountCount,
    activeUserCount,
    todayUploadedBatches,
    todayImportedOrders,
    todayPackedOrders,
    todayScanCount,
    openProblemOrders,
    brokenImageUrlCount,
    uploadPreviewRowCount,
    importRowIssueCount,
    scanLogCount,
    auditLogCount,
    oldPreviewRowCount,
    oldImportIssueCount,
    oldScanLogCount,
    oldAuditLogCount,
    demoUsers,
    skuMappingCount,
    activeReadyOrders,
    activeMappings
  ] = await Promise.all([
    prisma.account.count({ where: { active: true } }),
    prisma.user.count({ where: { active: true } }),
    prisma.uploadBatch.count({ where: { createdAt: { gte: today } } }),
    prisma.order.count({ where: { importedAt: { gte: today } } }),
    prisma.order.count({ where: { packedAt: { gte: today }, packStatus: "PACKED" } }),
    prisma.scanLog.count({ where: { createdAt: { gte: today } } }),
    prisma.problemOrder.count({ where: { status: "OPEN" } }),
    prisma.skuImageMapping.count({ where: { imageHealth: "BROKEN" } }),
    prisma.uploadPreviewRow.count(),
    prisma.importRowIssue.count(),
    prisma.scanLog.count(),
    prisma.auditLog.count(),
    prisma.uploadPreviewRow.count({ where: { createdAt: { lt: cutoffs.previewRows } } }),
    prisma.importRowIssue.count({ where: { createdAt: { lt: cutoffs.importIssues } } }),
    prisma.scanLog.count({ where: { createdAt: { lt: cutoffs.scanLogs } } }),
    prisma.auditLog.count({ where: { createdAt: { lt: cutoffs.auditLogs } } }),
    prisma.user.findMany({
      where: {
        username: { in: ["owner", "picker", "packer"] }
      },
      select: {
        username: true,
        active: true,
        passwordHash: true,
        mustChangePassword: true
      }
    }),
    prisma.skuImageMapping.count({ where: { active: true } }),
    prisma.order.findMany({
      where: {
        packStatus: "READY"
      },
      select: {
        accountId: true,
        sku: true,
        imageUrl: true
      },
      distinct: ["accountId", "sku"]
    }),
    prisma.skuImageMapping.findMany({
      where: { active: true },
      select: {
        accountId: true,
        sku: true,
        imageUrl: true
      }
    })
  ]);
  const [{ pendingMigrationCount, migrationCheckError }, imageCacheRootExists] = await Promise.all([
    getMigrationStatus(),
    Promise.resolve(existsSync(productImageCacheRoot()))
  ]);

  const mappingKeys = new Set(
    activeMappings
      .filter((mapping) => mapping.imageUrl)
      .map((mapping) => `${mapping.accountId}:${normalizeSkuForMatching(mapping.sku)}`)
  );
  const missingImageSkuCount = activeReadyOrders.filter(
    (order) => !order.imageUrl && !mappingKeys.has(`${order.accountId}:${normalizeSkuForMatching(order.sku)}`)
  ).length;

  const productionChecks = runProductionChecks({
    nodeEnv: process.env.NODE_ENV,
    sessionSecret: process.env.SESSION_SECRET,
    nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL,
    databaseUrl: process.env.DATABASE_URL,
    localNetworkOnly: process.env.LOCAL_NETWORK_ONLY,
    demoUsers,
    skuMappingCount,
    oldPreviewRowCount,
    oldImportIssueCount,
    oldScanLogCount,
    oldAuditLogCount,
    databasePingMs,
    imageCacheRootExists,
    pendingMigrationCount,
    migrationCheckError
  });

  return {
    appName: "Marketplace Pick & Pack",
    version: packageJson.version,
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
    authCookie,
    databasePingMs,
    databaseConnected,
    activeAccountCount,
    activeUserCount,
    todayUploadedBatches,
    todayImportedOrders,
    todayPackedOrders,
    todayScanCount,
    openProblemOrders,
    missingImageSkuCount,
    brokenImageUrlCount,
    uploadPreviewRowCount,
    importRowIssueCount,
    scanLogCount,
    auditLogCount,
    oldPreviewRowCount,
    oldImportIssueCount,
    oldScanLogCount,
    oldAuditLogCount,
    imageCacheRootExists,
    pendingMigrationCount,
    migrationCheckError,
    productionChecks,
    overallStatus: databaseConnected ? summarizeProductionChecks(productionChecks) : "NEEDS_ACTION"
  };
}
