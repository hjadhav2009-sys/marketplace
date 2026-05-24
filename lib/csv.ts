export type CsvValue = string | number | boolean | Date | null | undefined;

export function formatCsvValue(value: CsvValue) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = value instanceof Date ? value.toISOString() : String(value);
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
