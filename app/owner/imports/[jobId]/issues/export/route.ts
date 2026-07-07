import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { csvResponse, rowsToCsv, safeSpreadsheetValue, type CsvValue } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import { safeImportIssueContext } from "@/lib/import/issues";
import { prisma } from "@/lib/prisma";

const formats = new Set(["csv", "xlsx", "txt"]);

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "import-issues";
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
  const worksheet = workbook.addWorksheet("Import issues");
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

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  await requireUser(["OWNER"]);
  const { jobId } = await context.params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "csv";
  const issueType = url.searchParams.get("issueType") || undefined;
  const row = url.searchParams.get("row")?.trim();
  const sku = url.searchParams.get("sku")?.trim();
  const rowNumber = row ? Number.parseInt(row, 10) : undefined;

  if (!formats.has(format)) {
    return new Response("Invalid export format", { status: 400 });
  }

  const job = await prisma.importJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      importType: true,
      batchId: true
    }
  });

  if (!job?.batchId) {
    return new Response("No issue rows are linked to this job", { status: 404 });
  }

  const where: Prisma.ImportRowIssueWhereInput = {
    batchId: job.batchId,
    issueType,
    rowNumber: Number.isFinite(rowNumber) ? rowNumber : undefined,
    rawData: sku ? { contains: sku } : undefined
  };
  const issues = await prisma.importRowIssue.findMany({
    where,
    select: {
      rowNumber: true,
      issueType: true,
      message: true,
      rawData: true,
      createdAt: true
    },
    orderBy: [{ issueType: "asc" }, { rowNumber: "asc" }],
    take: 5000
  });
  const headers = ["rowNumber", "issueType", "message", "sku", "shipmentKey", "orderItemKey", "createdAt"];
  const rows = issues.map((issue) => {
    const safe = safeImportIssueContext(issue.rawData);
    return [
      issue.rowNumber,
      issue.issueType,
      issue.message,
      safe.sku,
      safe.shipmentKey,
      safe.orderItemKey,
      formatDateTime(issue.createdAt)
    ] satisfies CsvValue[];
  });
  const filenameBase = safeFilePart(`${job.importType}-${job.id.slice(0, 12)}-issues`);

  return responseFor(format, headers, rows, filenameBase);
}
