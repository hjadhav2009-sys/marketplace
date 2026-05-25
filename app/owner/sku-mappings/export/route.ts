import ExcelJS from "exceljs";
import { requireAccount, requireUser } from "@/lib/auth";
import { csvResponse, rowsToCsv, type CsvValue } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

const headers = ["sku", "image_url", "product_name", "color", "size", "cache_status", "image_health", "last_used_at", "updated_at"];

function filename(extension: "csv" | "xlsx", allAccounts: boolean, kind: string) {
  const scope = allAccounts ? "all-accounts" : "selected-account";
  return `${kind}-${scope}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

async function skuMappingRows(accountId: string, allAccounts: boolean, filter: "all" | "broken" | "not-cached"): Promise<CsvValue[][]> {
  const rows = await prisma.skuImageMapping.findMany({
    where: {
      accountId: allAccounts ? undefined : accountId,
      OR:
        filter === "broken"
          ? [{ imageHealth: "BROKEN" }, { cacheStatus: "BROKEN" }]
          : filter === "not-cached"
            ? [{ cacheStatus: "NOT_CACHED" }, { cacheStatus: "RECHECK_NEEDED" }]
            : undefined
    },
    include: { account: true },
    orderBy: [{ accountId: "asc" }, { sku: "asc" }]
  });

  return rows.map((mapping) => [
    mapping.sku,
    mapping.imageUrl,
    mapping.productName,
    mapping.color,
    mapping.size,
    mapping.cacheStatus,
    mapping.imageHealth,
    mapping.cacheLastUsedAt,
    mapping.updatedAt
  ]);
}

async function xlsxResponse(rows: CsvValue[][], allAccounts: boolean, kind: string) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("SKU mappings");

  worksheet.addRow(headers);
  for (const row of rows) {
    worksheet.addRow(row.map((value) => (value instanceof Date ? value.toISOString() : value)));
  }

  worksheet.columns.forEach((column) => {
    column.width = 20;
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename("xlsx", allAccounts, kind)}"`
    }
  });
}

export async function GET(request: Request) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const url = new URL(request.url);
  const allAccounts = user.role === "OWNER" && url.searchParams.get("scope") === "all";
  const filter = url.searchParams.get("health") === "broken" ? "broken" : url.searchParams.get("cache") === "not-cached" ? "not-cached" : "all";
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const rows = await skuMappingRows(account.id, allAccounts, filter);
  const kind = filter === "broken" ? "broken-sku-mappings" : filter === "not-cached" ? "not-cached-sku-mappings" : "sku-mappings";

  if (format === "xlsx") {
    return xlsxResponse(rows, allAccounts, kind);
  }

  return csvResponse(rowsToCsv(headers, rows), filename("csv", allAccounts, kind));
}
