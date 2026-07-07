export type CsvValue = string | number | boolean | Date | null | undefined;

export function escapeCsvFormulaText(text: string) {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function safeSpreadsheetValue(value: CsvValue) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return escapeCsvFormulaText(value);
  }

  return value;
}

export function formatCsvValue(value: CsvValue) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(safeSpreadsheetValue(value));
  const escaped = text.replace(/"/g, '""');

  if (/[",\r\n]/.test(escaped)) {
    return `"${escaped}"`;
  }

  return escaped;
}

export function rowsToCsv(headers: string[], rows: CsvValue[][]) {
  return [headers.map(formatCsvValue).join(","), ...rows.map((row) => row.map(formatCsvValue).join(","))].join("\n");
}

export function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}
