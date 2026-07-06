import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { extname, basename } from "node:path";
import { buildFlipkartDryRunSummary } from "../src/lib/marketplaces/flipkart/dry-run.ts";

function cellToString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    if ("text" in value && value.text) {
      return String(value.text);
    }

    if ("result" in value && value.result !== undefined) {
      return String(value.result);
    }

    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
  }

  return String(value);
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

async function readCsvRows(filePath) {
  const content = (await readFile(filePath, "utf8")).replace(/^\uFEFF/, "");
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}

async function readXlsxRows(filePath) {
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath);
  let headers = null;
  const rows = [];

  for await (const worksheetReader of workbookReader) {
    for await (const row of worksheetReader) {
      if (!headers) {
        headers = row.values.slice(1).map((header) => cellToString(header).trim());
        continue;
      }

      const values = row.values;
      const record = {};
      let hasValue = false;

      headers.forEach((header, index) => {
        if (!header) {
          return;
        }

        const value = cellToString(values[index + 1]).trim();
        record[header] = value;
        hasValue = hasValue || Boolean(value);
      });

      if (hasValue) {
        rows.push(record);
      }
    }

    break;
  }

  return rows;
}

async function readRows(filePath) {
  const extension = extname(filePath).toLowerCase();

  if (extension === ".xlsx") {
    return readXlsxRows(filePath);
  }

  if (extension === ".csv") {
    return readCsvRows(filePath);
  }

  throw new Error(`Unsupported file type for ${filePath}. Use .xlsx or .csv.`);
}

function line(label, value) {
  console.log(`${label}: ${value}`);
}

function list(label, values) {
  if (values.length === 0) {
    line(label, "none");
    return;
  }

  const visibleValues = values.slice(0, 25);
  const remainingCount = values.length - visibleValues.length;
  const suffix = remainingCount > 0 ? `, ... (${remainingCount} more)` : "";
  line(label, `${values.length} found: ${visibleValues.join(", ")}${suffix}`);
}

function printSummary(summary, orderPath, listingPath) {
  console.log("Flipkart dry-run summary");
  line("database required", "no");
  line("order file", basename(orderPath));
  line("listing file", basename(listingPath));
  console.log("");
  line("listing rows total", summary.listingRowsTotal);
  line("listing rows valid", summary.listingRowsValid);
  line("listing created plan", summary.listingPlan.created);
  line("listing updated plan", summary.listingPlan.updated);
  line("listing unchanged plan", summary.listingPlan.unchanged);
  line("listing plan mode", summary.listingPlan.mode);
  line("listing missing SKU count", summary.listingMissingSkuCount);
  line("listing duplicate Seller SKU Id count", summary.listingDuplicateSellerSkuCount);
  line("listing missing image count", summary.listingMissingImageCount);
  line("listing inactive count", summary.listingInactiveCount);
  console.log("");
  line("order rows total", summary.orderRowsTotal);
  line("order valid rows", summary.orderRowsValid);
  line("held rows", summary.heldRows);
  line("duplicate rows", summary.duplicateRows);
  line("missing SKU count", summary.missingSkuCount);
  line("missing listing count", summary.missingListingCount);
  line("missing image count", summary.missingImageCount);
  line("unique SKUs in order", summary.uniqueOrderSkus.length);
  line("unique Tracking IDs", summary.uniqueTrackingIds.length);
  line("multi-item Tracking IDs", summary.multiItemTrackingIds.length);
  console.log("");
  list("order unknown headers", summary.headers.orders.unknownHeaders);
  list("order missing expected headers", summary.headers.orders.missingExpectedHeaders);
  list("listing unknown headers", summary.headers.listings.unknownHeaders);
  list("listing missing expected headers", summary.headers.listings.missingExpectedHeaders);
}

const [, , orderPath, listingPath] = process.argv;

if (!orderPath || !listingPath) {
  console.error("Usage: npm run flipkart:dry-run -- <order.xlsx|csv> <listing.xlsx|csv>");
  process.exit(1);
}

try {
  const [orderRows, listingRows] = await Promise.all([readRows(orderPath), readRows(listingPath)]);
  printSummary(buildFlipkartDryRunSummary({ orderRows, listingRows }), orderPath, listingPath);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
