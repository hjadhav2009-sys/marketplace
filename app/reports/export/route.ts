import ExcelJS from "exceljs";
import { getAvailableAccounts, requireAccount, requireUser } from "@/lib/auth";
import { csvResponse, rowsToCsv, safeSpreadsheetValue, type CsvValue } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import { getReportsData, maskReportTrackingKey, reportExportTypes, REPORT_EXPORT_LIMIT, type ReportExportType } from "@/lib/reports";

const formats = new Set(["csv", "xlsx", "txt"]);

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "report";
}

function textResponse(text: string, filename: string) {
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}

async function xlsxResponse(headers: string[], rows: CsvValue[][], filename: string) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Report");
  worksheet.addRow(headers);
  for (const row of rows) {
    worksheet.addRow(row.map(safeSpreadsheetValue));
  }
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.columns.forEach((column) => {
    column.width = Math.min(42, Math.max(14, Number(column.header?.toString().length ?? 14) + 4));
  });
  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}

function tableText(headers: string[], rows: CsvValue[][]) {
  return [headers.join("\t"), ...rows.map((row) => row.map(safeSpreadsheetValue).join("\t"))].join("\n");
}

function responseFor(format: string, headers: string[], rows: CsvValue[][], filenameBase: string) {
  if (format === "xlsx") {
    return xlsxResponse(headers, rows, `${filenameBase}.xlsx`);
  }

  if (format === "txt") {
    return textResponse(tableText(headers, rows), `${filenameBase}.txt`);
  }

  return csvResponse(rowsToCsv(headers, rows), `${filenameBase}.csv`);
}

function orderRows(report: Awaited<ReturnType<typeof getReportsData>>) {
  return report.orders.map((order) => [
    order.marketplace,
    order.account.accountDisplayName ?? order.account.name,
    order.sku,
    order.qty,
    order.packStatus,
    order.pickStatus,
    order.courier,
    maskReportTrackingKey(order),
    order.uploadBatch?.fileName,
    formatDateTime(order.importedAt),
    formatDateTime(order.packedAt)
  ] satisfies CsvValue[]);
}

function rowsForType(type: ReportExportType, report: Awaited<ReturnType<typeof getReportsData>>) {
  if (type === "sku-summary") {
    return {
      headers: ["sku", "quantity"],
      rows: report.tables.skuSummary.map((row) => [row.label, row.count] satisfies CsvValue[])
    };
  }

  if (type === "order-summary") {
    return {
      headers: ["metric", "value"],
      rows: [
        ["totalOrders", report.summary.totalOrders],
        ["todayReady", report.summary.todayReady],
        ["todayPicked", report.summary.todayPicked],
        ["todayPacked", report.summary.todayPacked],
        ["problemsOpen", report.summary.problemsOpen],
        ["oldPending", report.summary.oldPending],
        ["missingListingCurrent", report.summary.currentMissingListing],
        ["missingImageCurrent", report.summary.currentMissingImage],
        ["missingListingAtImportTime", report.importTime.missingListingRows],
        ["missingImageAtImportTime", report.importTime.missingImageRows],
        ["warningRowsAtImportTime", report.importTime.warningRows],
        ["errorRowsAtImportTime", report.importTime.errorRows]
      ] satisfies CsvValue[][]
    };
  }

  return {
    headers: ["marketplace", "account", "sku", "qty", "packStatus", "pickStatus", "courier", "trackingKey", "batch", "importedAt", "packedAt"],
    rows: orderRows(report)
  };
}

export async function GET(request: Request) {
  const user = await requireUser(["OWNER"]);
  const selectedAccount = await requireAccount(user);
  const accounts = await getAvailableAccounts(user);
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "csv";
  const type = (url.searchParams.get("type") ?? "order-summary") as ReportExportType;

  if (!formats.has(format) || !reportExportTypes.includes(type)) {
    return new Response("Invalid report export request", { status: 400 });
  }

  const statusByType: Partial<Record<ReportExportType, string>> = {
    "packed-orders": "packed",
    "pending-orders": "ready",
    "problem-orders": "problem",
    "old-pending": "old-pending",
    "missing-listing": "missing-listing",
    "missing-image": "missing-image"
  };
  const report = await getReportsData({
    accounts,
    selectedAccount,
    pageSize: REPORT_EXPORT_LIMIT,
    filters: {
      accountId: url.searchParams.get("accountId") ?? undefined,
      marketplace: url.searchParams.get("marketplace") ?? undefined,
      batchId: url.searchParams.get("batchId") ?? undefined,
      sku: url.searchParams.get("sku") ?? undefined,
      courier: url.searchParams.get("courier") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      status: statusByType[type] ?? url.searchParams.get("status") ?? undefined
    }
  });
  const { headers, rows } = rowsForType(type, report);
  const filenameBase = safeFilePart(`${type}-${new Date().toISOString().slice(0, 10)}`);

  return responseFor(format, headers, rows, filenameBase);
}
