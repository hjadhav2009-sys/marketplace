import ExcelJS from "exceljs";
import { requireAccount, requireUser } from "@/lib/auth";
import { csvResponse, rowsToCsv, type CsvValue } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

const headers = ["account", "sku", "image_url", "product_name", "color", "notes", "active", "image_health", "updated_at"];

function filename(extension: "csv" | "xlsx", allAccounts: boolean) {
  const scope = allAccounts ? "all-accounts" : "selected-account";
  return `sku-mappings-${scope}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

async function skuMappingRows(accountId: string, allAccounts: boolean): Promise<CsvValue[][]> {
  const rows = await prisma.skuImageMapping.findMany({
    where: {
      accountId: allAccounts ? undefined : accountId
    },
    include: { account: true },
    orderBy: [{ accountId: "asc" }, { sku: "asc" }]
  });

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

async function xlsxResponse(rows: CsvValue[][], allAccounts: boolean) {
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
      "Content-Disposition": `attachment; filename="${filename("xlsx", allAccounts)}"`
    }
  });
}

export async function GET(request: Request) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const url = new URL(request.url);
  const allAccounts = user.role === "OWNER" && url.searchParams.get("scope") === "all";
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const rows = await skuMappingRows(account.id, allAccounts);

  if (format === "xlsx") {
    return xlsxResponse(rows, allAccounts);
  }

  return csvResponse(rowsToCsv(headers, rows), filename("csv", allAccounts));
}
