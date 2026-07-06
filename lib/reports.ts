import type { Account, Prisma } from "@prisma/client";
import { maskOperationalKey } from "./import/issues";
import { startOfWorkDay } from "./operations/work-queue";
import { prisma } from "./prisma";

export const REPORT_PAGE_SIZE = 25;
export const REPORT_TABLE_LIMIT = 25;
export const REPORT_EXPORT_LIMIT = 5000;

export const reportStatuses = ["", "ready", "picked", "packed", "problem", "old-pending", "missing-listing", "missing-image"] as const;
export const reportExportTypes = [
  "order-summary",
  "packed-orders",
  "pending-orders",
  "problem-orders",
  "old-pending",
  "missing-listing",
  "missing-image",
  "sku-summary"
] as const;

export type ReportStatus = (typeof reportStatuses)[number];
export type ReportExportType = (typeof reportExportTypes)[number];

export type ReportFilters = {
  accountId?: string;
  marketplace?: string;
  batchId?: string;
  sku?: string;
  status?: string;
  courier?: string;
  from?: string;
  to?: string;
  page?: string;
};

export type ReportOrderRow = {
  id: string;
  accountId: string;
  marketplace: string;
  batchId: string | null;
  sku: string;
  qty: number;
  courier: string | null;
  awb: string;
  trackingId: string | null;
  packStatus: string;
  pickStatus: string;
  status: string;
  importedAt: Date;
  packedAt: Date | null;
  oldPendingReviewStatus: string;
  account: {
    companyName: string;
    marketplace: string;
    name: string;
    accountDisplayName: string | null;
    accountCode: string | null;
    code: string;
  };
  uploadBatch: {
    fileName: string;
  } | null;
};

function parseDate(value: string | undefined, endOfDay = false) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return undefined;
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }

  return date;
}

export function reportDateRange(filters: Pick<ReportFilters, "from" | "to">, defaultToday = true) {
  const gte = parseDate(filters.from);
  const lte = parseDate(filters.to, true);

  if (!gte && !lte) {
    if (!defaultToday) {
      return undefined;
    }

    const today = startOfWorkDay();
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    return { gte: today, lte: end };
  }

  return { gte, lte };
}

export function normalizeReportStatus(value: string | undefined): ReportStatus {
  return reportStatuses.includes(value as ReportStatus) ? (value as ReportStatus) : "";
}

export function parseReportPage(value: string | undefined) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function reportStatusWhere(status: ReportStatus, now = new Date()): Prisma.OrderWhereInput {
  const today = startOfWorkDay(now);

  if (status === "ready") {
    return { packStatus: "READY" };
  }

  if (status === "picked") {
    return { pickStatus: "PICKED" };
  }

  if (status === "packed") {
    return { packStatus: "PACKED" };
  }

  if (status === "problem") {
    return { OR: [{ status: "PROBLEM" }, { pickStatus: "PROBLEM" }, { packStatus: "PROBLEM" }] };
  }

  if (status === "old-pending") {
    return { packStatus: "READY", importedAt: { lt: today } };
  }

  return {};
}

export function buildReportOrderWhere(input: {
  accountIds: string[];
  filters: ReportFilters;
  includeStatus?: boolean;
}): Prisma.OrderWhereInput {
  const dateRange = reportDateRange(input.filters);
  const status = normalizeReportStatus(input.filters.status);
  const effectiveDateRange = status === "old-pending" && !input.filters.from && !input.filters.to ? reportDateRange(input.filters, false) : dateRange;
  const statusWhere = input.includeStatus === false || status === "missing-listing" || status === "missing-image" ? {} : reportStatusWhere(status);

  return {
    accountId: { in: input.accountIds },
    importedAt: effectiveDateRange,
    marketplace: input.filters.marketplace || undefined,
    batchId: input.filters.batchId || undefined,
    sku: input.filters.sku?.trim() ? { contains: input.filters.sku.trim() } : undefined,
    courier: input.filters.courier?.trim() ? { contains: input.filters.courier.trim() } : undefined,
    ...statusWhere
  };
}

function accountLabel(account: Pick<Account, "accountDisplayName" | "name" | "accountCode" | "code">) {
  return `${account.accountDisplayName ?? account.name} (${account.accountCode ?? account.code})`;
}

function listingKey(input: { accountId: string; marketplace: string; sku: string }) {
  return `${input.accountId}\u0000${input.marketplace}\u0000${input.sku}`;
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function toSummaryRows(map: Map<string, number>) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, REPORT_TABLE_LIMIT)
    .map(([label, count]) => ({ label, count }));
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function maskReportTrackingKey(order: Pick<ReportOrderRow, "trackingId" | "awb">) {
  return maskOperationalKey(order.trackingId ?? order.awb) ?? "";
}

export async function getReportsData(input: {
  accounts: Account[];
  selectedAccount: Account;
  filters: ReportFilters;
  pageSize?: number;
}) {
  const requestedAccountId = input.filters.accountId;
  const allAccountIds = input.accounts.map((account) => account.id);
  const accountIds =
    requestedAccountId === "all"
      ? allAccountIds
      : requestedAccountId && allAccountIds.includes(requestedAccountId)
        ? [requestedAccountId]
        : [input.selectedAccount.id];
  const status = normalizeReportStatus(input.filters.status);
  const page = parseReportPage(input.filters.page);
  const pageSize = input.pageSize ?? REPORT_PAGE_SIZE;
  const baseWhere = buildReportOrderWhere({ accountIds, filters: input.filters, includeStatus: false });
  const selectedWhere = buildReportOrderWhere({ accountIds, filters: input.filters, includeStatus: true });
  const today = startOfWorkDay();
  const currentScopeOrders = await prisma.order.findMany({
    where: baseWhere,
    select: {
      id: true,
      accountId: true,
      marketplace: true,
      sku: true,
      qty: true,
      courier: true,
      importedAt: true,
      packedAt: true,
      packStatus: true,
      pickStatus: true,
      status: true,
      oldPendingReviewStatus: true,
      awb: true,
      trackingId: true,
      batchId: true,
      account: {
        select: {
          companyName: true,
          marketplace: true,
          name: true,
          accountDisplayName: true,
          accountCode: true,
          code: true
        }
      },
      uploadBatch: {
        select: { fileName: true }
      }
    },
    orderBy: { importedAt: "desc" },
    take: REPORT_EXPORT_LIMIT
  }) satisfies ReportOrderRow[];
  const uniqueSkus = [...new Set(currentScopeOrders.map((order) => order.sku).filter(Boolean))];
  const listings = uniqueSkus.length
    ? await prisma.marketplaceListing.findMany({
        where: {
          accountId: { in: accountIds },
          sku: { in: uniqueSkus },
          marketplace: input.filters.marketplace || undefined
        },
        select: {
          accountId: true,
          marketplace: true,
          sku: true,
          mainImageUrl: true
        }
      })
    : [];
  const listingByKey = new Map(listings.map((listing) => [listingKey(listing), listing]));
  const missingListingOrders = currentScopeOrders.filter((order) => !listingByKey.has(listingKey(order)));
  const missingImageOrders = currentScopeOrders.filter((order) => {
    const listing = listingByKey.get(listingKey(order));
    return listing && !listing.mainImageUrl;
  });
  const currentMissingListingIds = new Set(missingListingOrders.map((order) => order.id));
  const currentMissingImageIds = new Set(missingImageOrders.map((order) => order.id));
  const selectedCurrentRows =
    status === "missing-listing"
      ? missingListingOrders
      : status === "missing-image"
        ? missingImageOrders
        : currentScopeOrders.filter((order) => {
            if (status === "ready") return order.packStatus === "READY";
            if (status === "picked") return order.pickStatus === "PICKED";
            if (status === "packed") return order.packStatus === "PACKED";
            if (status === "problem") return order.status === "PROBLEM" || order.pickStatus === "PROBLEM" || order.packStatus === "PROBLEM";
            if (status === "old-pending") return order.packStatus === "READY" && order.importedAt < today;
            return true;
          });
  const totalRows = status === "missing-listing" || status === "missing-image" ? selectedCurrentRows.length : await prisma.order.count({ where: selectedWhere });
  const orders =
    status === "missing-listing" || status === "missing-image"
      ? selectedCurrentRows.slice((page - 1) * pageSize, page * pageSize)
      : ((await prisma.order.findMany({
          where: selectedWhere,
          select: {
            id: true,
            accountId: true,
            marketplace: true,
            batchId: true,
            sku: true,
            qty: true,
            courier: true,
            awb: true,
            trackingId: true,
            packStatus: true,
            pickStatus: true,
            status: true,
            importedAt: true,
            packedAt: true,
            oldPendingReviewStatus: true,
            account: {
              select: {
                companyName: true,
                marketplace: true,
                name: true,
                accountDisplayName: true,
                accountCode: true,
                code: true
              }
            },
            uploadBatch: {
              select: { fileName: true }
            }
          },
          orderBy: { importedAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize
        })) as ReportOrderRow[]);
  const oldPendingWhere: Prisma.OrderWhereInput = {
    accountId: { in: accountIds },
    packStatus: "READY",
    importedAt: { lt: today },
    marketplace: input.filters.marketplace || undefined,
    sku: input.filters.sku?.trim() ? { contains: input.filters.sku.trim() } : undefined,
    courier: input.filters.courier?.trim() ? { contains: input.filters.courier.trim() } : undefined
  };
  const [problemOpenCount, oldPendingCount, importWarningSums, batches, problemRows] = await Promise.all([
    prisma.problemOrder.count({ where: { accountId: { in: accountIds }, status: "OPEN" } }),
    prisma.order.count({ where: oldPendingWhere }),
    prisma.importJob.aggregate({
      where: {
        accountId: { in: accountIds },
        marketplace: input.filters.marketplace || undefined,
        createdAt: reportDateRange(input.filters)
      },
      _sum: {
        missingListingRows: true,
        missingImageRows: true,
        warningRows: true,
        errorRows: true
      }
    }),
    prisma.uploadBatch.findMany({
      where: {
        accountId: { in: accountIds },
        createdAt: reportDateRange(input.filters),
        notes: input.filters.marketplace ? { contains: input.filters.marketplace } : undefined
      },
      select: {
        id: true,
        fileName: true,
        importType: true,
        status: true,
        createdRows: true,
        updatedRows: true,
        duplicateRows: true,
        missingImageRows: true,
        errorRows: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.problemOrder.findMany({
      where: {
        accountId: { in: accountIds },
        createdAt: reportDateRange(input.filters)
      },
      select: {
        id: true,
        status: true,
        reason: true,
        createdAt: true,
        order: {
          select: {
            marketplace: true,
            sku: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: REPORT_TABLE_LIMIT
    })
  ]);
  const dailyMap = new Map<string, number>();
  const skuMap = new Map<string, number>();
  const courierMap = new Map<string, number>();
  const accountMap = new Map<string, number>();
  const problemMap = new Map<string, number>();

  for (const order of currentScopeOrders) {
    increment(dailyMap, dayKey(order.importedAt), order.qty);
    increment(skuMap, order.sku, order.qty);
    increment(courierMap, order.courier ?? "Unknown", order.qty);
    increment(accountMap, `${order.account.marketplace} / ${accountLabel(order.account)}`, order.qty);
  }

  for (const problem of problemRows) {
    increment(problemMap, `${problem.status} / ${problem.reason}`);
  }

  const todayReadyCount = currentScopeOrders.filter((order) => order.packStatus === "READY" && order.importedAt >= today).length;
  const todayPickedCount = currentScopeOrders.filter((order) => order.pickStatus === "PICKED" && order.importedAt >= today).length;
  const packedTodayCount = currentScopeOrders.filter((order) => order.packStatus === "PACKED" && order.packedAt && order.packedAt >= today).length;

  return {
    accountIds,
    page,
    pageSize,
    totalRows,
    totalPages: Math.max(1, Math.ceil(totalRows / pageSize)),
    orders,
    currentMissingListingIds,
    currentMissingImageIds,
    missingListingOrders,
    missingImageOrders,
    importTime: {
      missingListingRows: importWarningSums._sum.missingListingRows ?? 0,
      missingImageRows: importWarningSums._sum.missingImageRows ?? 0,
      warningRows: importWarningSums._sum.warningRows ?? 0,
      errorRows: importWarningSums._sum.errorRows ?? 0
    },
    summary: {
      totalOrders: currentScopeOrders.length,
      todayReady: todayReadyCount,
      todayPicked: todayPickedCount,
      todayPacked: packedTodayCount,
      problemsOpen: problemOpenCount,
      oldPending: oldPendingCount,
      currentMissingListing: missingListingOrders.length,
      currentMissingImage: missingImageOrders.length,
      packedToday: packedTodayCount,
      pendingToday: todayReadyCount
    },
    tables: {
      dailySummary: toSummaryRows(dailyMap),
      skuSummary: toSummaryRows(skuMap),
      courierSummary: toSummaryRows(courierMap),
      accountSummary: toSummaryRows(accountMap),
      problemSummary: toSummaryRows(problemMap)
    },
    batches
  };
}
