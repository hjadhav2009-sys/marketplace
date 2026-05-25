import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth";
import { csvResponse, rowsToCsv } from "@/lib/csv";

const headers = ["sku", "image_url"];

export async function GET(request: Request) {
  await requireUser(["OWNER"]);
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const today = new Date().toISOString().slice(0, 10);

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("SKU image template");
    worksheet.addRow(headers);
    worksheet.addRow(["SKU123", "https://images-r.meesho.com/images/products/example.jpg"]);
    worksheet.columns.forEach((column) => {
      column.width = 32;
    });
    const buffer = await workbook.xlsx.writeBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="sku-image-template-${today}.xlsx"`
      }
    });
  }

  return csvResponse(rowsToCsv(headers, []), `sku-image-template-${today}.csv`);
}
