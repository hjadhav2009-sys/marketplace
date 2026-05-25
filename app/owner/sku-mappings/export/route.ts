import ExcelJS from "exceljs";
import { requireAccount, requireUser } from "@/lib/auth";
import { csvResponse, rowsToCsv, type CsvValue } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

const headers = ["account", "sku", "image_url", "product_name", "color", "notes", "active", "image_health", "updated_at"];
const brokenHeaders = ["account", "sku", "image_url", "product_name", "color", "image_health", "updated_at"];

function filename(extension: "csv" | "xlsx", allAccounts: boolean, brokenOnly: boolean) {
  const scope = allAccounts ? "all-accounts" : "selected-account";
  const kind = brokenOnly ? "broken-sku-mappings" : "sku-mappings";
  return `${kind}-${scope}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

async function skuMappingRows(accountId: string, allAccounts: boolean, brokenOnly: boolean): Promise<CsvValue[][]> {
  const rows = await prisma.skuImageMapping.findMany({
    where: {
      accountId: allAccounts ? undefined : accountId,
      imageHealth: brokenOnly ? "BROKEN" : undefined
    },
    include: { account: true },
    orderBy: [{ accountId: "asc" }, { sku: "asc" }]
  });

  if (brokenOnly) {
    return rows.map((mapping) => [
      mapping.account.name,
      mapping.sku,
      mapping.imageUrl,
      mapping.productName,
      mapping.color,
      mapping.imageHealth,
      mapping.updatedAt
    ]);
  }

  return rows.map((mapping) => [
    mapping.account.name,
    mapping.sku,
    mapping.imageUrl,
    mapping.productName,
    mapping.color,
    mapping.notes,
    mapping.active,
    mapping.imageHealth,
    mapping.updatedAt
  ]);
}

async function xlsxResponse(rows: CsvValue[][], allAccounts: boolean, brokenOnly: boolean) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("SKU mappings");

  worksheet.addRow(brokenOnly ? brokenHeaders : headers);
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
      "Content-Disposition": `attachment; filename="${filename("xlsx", allAccounts, brokenOnly)}"`
    }
  });
}

export async function GET(request: Request) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const url = new URL(request.url);
  const allAccounts = user.role === "OWNER" && url.searchParams.get("scope") === "all";
  const brokenOnly = url.searchParams.get("health") === "broken";
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const rows = await skuMappingRows(account.id, allAccounts, brokenOnly);
  const selectedHeaders = brokenOnly ? brokenHeaders : headers;

  if (format === "xlsx") {
    return xlsxResponse(rows, allAccounts, brokenOnly);
  }

  return csvResponse(rowsToCsv(selectedHeaders, rows), filename("csv", allAccounts, brokenOnly));
}
