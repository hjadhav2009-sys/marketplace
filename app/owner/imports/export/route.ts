import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth";
import { csvResponse, rowsToCsv, type CsvValue } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import { safeImportIssueContext } from "@/lib/import/issues";
import { prisma } from "@/lib/prisma";
import { importJobProgressPercent } from "@/src/lib/import-jobs/progress";

const formats = new Set(["csv", "xlsx", "txt"]);
const exportTypes = new Set(["summary", "issues"]);

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "import-job";
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
  const worksheet = workbook.addWorksheet("Import job");
  worksheet.addRow(headers);
  for (const row of rows) {
    worksheet.addRow(row.map((value) => (value instanceof Date ? value.toISOString() : value ?? "")));
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
  return [headers.join("\t"), ...rows.map((row) => row.map((value) => (value instanceof Date ? value.toISOString() : value ?? "")).join("\t"))].join("\n");
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

export async function GET(request: Request) {
  await requireUser(["OWNER"]);
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId") ?? "";
  const format = url.searchParams.get("format") ?? "csv";
  const type = url.searchParams.get("type") ?? "summary";

  if (!jobId || !formats.has(format) || !exportTypes.has(type)) {
    return new Response("Invalid export request", { status: 400 });
  }

  const job = await prisma.importJob.findUnique({
    where: { id: jobId },
    include: {
      account: {
        select: {
          companyName: true,
          marketplace: true,
          name: true,
          accountDisplayName: true,
          code: true,
          accountCode: true
        }
      }
    }
  });

  if (!job) {
    return new Response("Import job not found", { status: 404 });
  }

  const filenameBase = safeFilePart(`${job.importType}-${job.id.slice(0, 12)}-${type}`);

  if (type === "issues") {
    if (!job.batchId) {
      return new Response("No issue rows are linked to this job", { status: 404 });
    }

    const issues = await prisma.importRowIssue.findMany({
      where: { batchId: job.batchId },
      select: {
        rowNumber: true,
        issueType: true,
        message: true,
        rawData: true,
        createdAt: true
      },
      orderBy: [{ issueType: "asc" }, { rowNumber: "asc" }]
    });
    const headers = ["rowNumber", "issueType", "message", "sku", "shipmentKey", "orderItemKey", "createdAt"];
    const rows = issues.map((issue) => {
      const safe = safeImportIssueContext(issue.rawData);
      return [issue.rowNumber, issue.issueType, issue.message, safe.sku, safe.shipmentKey, safe.orderItemKey, issue.createdAt] satisfies CsvValue[];
    });
    return responseFor(format, headers, rows, filenameBase);
  }

  const headers = [
    "jobId",
    "importType",
    "marketplace",
    "company",
    "account",
    "accountCode",
    "status",
    "progressPercent",
    "processedRows",
    "totalRows",
    "createdRows",
    "updatedRows",
    "unchangedRows",
    "duplicateRows",
    "warningRows",
    "errorRows",
    "missingListingRows",
    "missingImageRows",
    "startedAt",
    "finishedAt",
    "updatedAt",
    "lastError"
  ];
  const rows = [[
    job.id,
    job.importType,
    job.marketplace,
    job.account.companyName,
    job.account.accountDisplayName ?? job.account.name,
    job.account.accountCode ?? job.account.code,
    job.status,
    importJobProgressPercent(job),
    job.processedRows,
    job.totalRows,
    job.createdRows,
    job.updatedRows,
    job.unchangedRows,
    job.duplicateRows,
    job.warningRows,
    job.errorRows,
    job.missingListingRows,
    job.missingImageRows,
    formatDateTime(job.startedAt),
    formatDateTime(job.finishedAt),
    formatDateTime(job.updatedAt),
    job.lastError
  ] satisfies CsvValue[]];

  return responseFor(format, headers, rows, filenameBase);
}
