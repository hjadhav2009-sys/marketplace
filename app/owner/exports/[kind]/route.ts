import { getCurrentUser } from "@/lib/auth";
import { csvResponse, rowsToCsv, type CsvValue } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import type { BatchStatus, PackStatus, ProblemStatus, ScanOutcome } from "@prisma/client";

const exportKinds = new Set([
  "orders",
  "packed-orders",
  "pending-orders",
  "problem-orders",
  "scan-logs",
  "sku-mappings",
  "upload-batches"
]);

function parseDate(value: string | null, endOfDay = false) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }

  return date;
}

function dateRange(searchParams: URLSearchParams) {
  const gte = parseDate(searchParams.get("from"));
  const lte = parseDate(searchParams.get("to"), true);

  if (!gte && !lte) {
    return undefined;
  }

  return { gte, lte };
}

function filename(kind: string) {
  return `${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
}

function accountFilter(searchParams: URLSearchParams) {
  return searchParams.get("accountId") || undefined;
}

function paymentOrStatusFilter(searchParams: URLSearchParams) {
  return searchParams.get("status") || undefined;
}

function packStatusFilter(value: string | undefined): PackStatus | undefined {
  return value === "READY" || value === "PACKED" || value === "PROBLEM" ? value : undefined;
}

function problemStatusFilter(value: string | undefined): ProblemStatus | undefined {
  return value === "OPEN" || value === "RESOLVED" ? value : undefined;
}

function scanOutcomeFilter(value: string | undefined): ScanOutcome | undefined {
  return value === "FOUND" || value === "PACKED" || value === "PROBLEM" || value === "NOT_FOUND" ? value : undefined;
}

function batchStatusFilter(value: string | undefined): BatchStatus | undefined {
  return value === "UPLOADED" || value === "PARSED" || value === "REVIEWED" || value === "IMPORTED" || value === "FAILED" ? value : undefined;
}

export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();

  if (!user || user.role !== "OWNER") {
    return new Response("Forbidden", { status: 403 });
  }

  const { kind } = await context.params;

  if (!exportKinds.has(kind)) {
    return new Response("Unknown export", { status: 404 });
  }

  try {
    const url = new URL(request.url);
    const csv = await buildExport(kind, url.searchParams);
    return csvResponse(csv, filename(kind));
  } catch {
    return new Response("Export failed. Please check filters and try again.", { status: 500 });
  }
}

async function buildExport(kind: string, searchParams: URLSearchParams) {
  if (kind === "scan-logs") {
    return scanLogsCsv(searchParams);
  }

  if (kind === "sku-mappings") {
    return skuMappingsCsv(searchParams);
  }

  if (kind === "upload-batches") {
    return uploadBatchesCsv(searchParams);
  }

  if (kind === "problem-orders") {
    return problemOrdersCsv(searchParams);
  }

  return ordersCsv(kind, searchParams);
}

async function ordersCsv(kind: string, searchParams: URLSearchParams) {
  const range = dateRange(searchParams);
  const status = paymentOrStatusFilter(searchParams);
  const packStatus = packStatusFilter(status);
  const rows = await prisma.order.findMany({
    where: {
      accountId: accountFilter(searchParams),
      importedAt: kind === "packed-orders" ? undefined : range,
      packedAt: kind === "packed-orders" ? range : undefined,
      packStatus:
        kind === "packed-orders"
          ? "PACKED"
          : kind === "pending-orders"
            ? "READY"
            : packStatus
    },
    include: { account: true },
    orderBy: { importedAt: "desc" }
  });

  return rowsToCsv(
    [
      "account",
      "awb",
      "orderNo",
      "sku",
      "qty",
      "color",
      "size",
      "courier",
      "pickStatus",
      "packStatus",
      "paymentType",
      "productDescription",
      "imageUrl",
      "importedAt",
      "packedAt"
    ],
    rows.map((order) => [
      order.account.name,
      order.awb,
      order.orderNo,
      order.sku,
      order.qty,
      order.color,
      order.size,
      order.courier,
      order.pickStatus,
      order.packStatus,
      order.paymentType,
      order.productDescription,
      order.imageUrl,
      order.importedAt,
      order.packedAt
    ])
  );
}

async function problemOrdersCsv(searchParams: URLSearchParams) {
  const status = problemStatusFilter(paymentOrStatusFilter(searchParams));
  const rows = await prisma.problemOrder.findMany({
    where: {
      accountId: accountFilter(searchParams),
      createdAt: dateRange(searchParams),
      status
    },
    include: {
      account: true,
      order: true,
      reportedBy: true
    },
    orderBy: { createdAt: "desc" }
  });

  return rowsToCsv(
    ["account", "awb", "orderNo", "sku", "qty", "color", "size", "courier", "reason", "status", "reportedBy", "createdAt", "resolvedAt"],
    rows.map((problem) => [
      problem.account.name,
      problem.order.awb,
      problem.order.orderNo,
      problem.order.sku,
      problem.order.qty,
      problem.order.color,
      problem.order.size,
      problem.order.courier,
      problem.reason,
      problem.status,
      problem.reportedBy?.name,
      problem.createdAt,
      problem.resolvedAt
    ])
  );
}

async function scanLogsCsv(searchParams: URLSearchParams) {
  const outcome = scanOutcomeFilter(paymentOrStatusFilter(searchParams));
  const rows = await prisma.scanLog.findMany({
    where: {
      accountId: accountFilter(searchParams),
      createdAt: dateRange(searchParams),
      outcome
    },
    include: {
      account: true,
      scannedBy: true
    },
    orderBy: { createdAt: "desc" }
  });

  return rowsToCsv(
    ["account", "awb", "outcome", "scannedBy", "createdAt", "note"],
    rows.map((scan) => [scan.account.name, scan.awb, scan.outcome, scan.scannedBy?.name, scan.createdAt, scan.note])
  );
}

async function skuMappingsCsv(searchParams: URLSearchParams) {
  const rows = await prisma.skuImageMapping.findMany({
    where: {
      accountId: accountFilter(searchParams),
      updatedAt: dateRange(searchParams),
      active: paymentOrStatusFilter(searchParams) === "inactive" ? false : paymentOrStatusFilter(searchParams) === "active" ? true : undefined
    },
    include: { account: true },
    orderBy: { updatedAt: "desc" }
  });

  return rowsToCsv(
    ["account", "sku", "productName", "imageUrl", "color", "active", "imageHealth", "updatedAt"],
    rows.map((mapping) => [
      mapping.account.name,
      mapping.sku,
      mapping.productName,
      mapping.imageUrl,
      mapping.color,
      mapping.active,
      mapping.imageHealth,
      mapping.updatedAt
    ])
  );
}

async function uploadBatchesCsv(searchParams: URLSearchParams) {
  const status = batchStatusFilter(paymentOrStatusFilter(searchParams));
  const rows = await prisma.uploadBatch.findMany({
    where: {
      accountId: accountFilter(searchParams),
      createdAt: dateRange(searchParams),
      status
    },
    include: {
      account: true,
      createdBy: true
    },
    orderBy: { createdAt: "desc" }
  });

  const csvRows: CsvValue[][] = rows.map((batch) => [
    batch.account.name,
    batch.fileName,
    batch.importType,
    batch.status,
    batch.totalRows,
    batch.createdRows,
    batch.updatedRows,
    batch.duplicateRows,
    batch.missingImageRows,
    batch.skippedRows,
    batch.errorRows,
    batch.createdBy?.name,
    batch.createdAt
  ]);

  return rowsToCsv(
    [
      "account",
      "fileName",
      "importType",
      "status",
      "totalRows",
      "createdRows",
      "updatedRows",
      "duplicateRows",
      "missingImageRows",
      "skippedRows",
      "errorRows",
      "createdBy",
      "createdAt"
    ],
    csvRows
  );
}
