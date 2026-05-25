import packageJson from "../package.json";
import { sessionCookieSecurityDiagnostics } from "./auth-helpers";
import { prisma } from "./prisma";
import { runProductionChecks, summarizeProductionChecks } from "./production-checks";
import { cleanupCutoffs } from "./cleanup";

export type SystemHealth = Awaited<ReturnType<typeof getSystemHealth>>;

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
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
    const productionChecks = runProductionChecks({
      nodeEnv: process.env.NODE_ENV,
      sessionSecret: process.env.SESSION_SECRET,
      nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL,
      databaseUrl: process.env.DATABASE_URL,
      localNetworkOnly: process.env.LOCAL_NETWORK_ONLY
    });

    return {
      appName: "Meesho Pick & Pack",
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
    prisma.account.count(),
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

  const mappingKeys = new Set(activeMappings.filter((mapping) => mapping.imageUrl).map((mapping) => `${mapping.accountId}:${mapping.sku}`));
  const missingImageSkuCount = activeReadyOrders.filter((order) => !order.imageUrl && !mappingKeys.has(`${order.accountId}:${order.sku}`)).length;

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
    oldAuditLogCount
  });

  return {
    appName: "Meesho Pick & Pack",
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
    productionChecks,
    overallStatus: databaseConnected ? summarizeProductionChecks(productionChecks) : "NEEDS_ACTION"
  };
}
