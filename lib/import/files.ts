import ExcelJS from "exceljs";
import type { RawImportRow } from "./sku-mappings";

function cellToString(value: ExcelJS.CellValue) {
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

export async function parseSpreadsheetRows(file: File): Promise<RawImportRow[]> {
  const extension = file.name.toLowerCase().split(".").pop();
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  let worksheet: ExcelJS.Worksheet | undefined;

  if (extension === "csv") {
    return parseCsvRows(buffer.toString("utf8"));
  } else if (extension === "xlsx") {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    worksheet = workbook.worksheets[0];
  } else {
    throw new Error("Upload a CSV or .xlsx file.");
  }

  if (!worksheet || worksheet.rowCount < 2) {
    return [];
  }

  const headerValues = worksheet.getRow(1).values as ExcelJS.CellValue[];
  const headers = headerValues.slice(1).map((header) => cellToString(header).trim());

  const rows: RawImportRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const values = row.values as ExcelJS.CellValue[];
    const record: RawImportRow = {};
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
  });

  return rows;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
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

function parseCsvRows(content: string) {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<RawImportRow>((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}
