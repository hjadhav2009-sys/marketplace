import { amazonShipmentCandidates, parseAmazonCandidateTables } from "./candidate-policy";

export const AMAZON_STORED_REPARSE_MAX_FILES = Number(process.env.AMAZON_STORED_REPARSE_MAX_FILES ?? 30);
export const AMAZON_STORED_REPARSE_MAX_AGGREGATE_BYTES = Number(process.env.AMAZON_STORED_REPARSE_MAX_AGGREGATE_BYTES ?? 150 * 1024 * 1024);
export const AMAZON_STORED_REPARSE_MAX_SINGLE_FILE_BYTES = Number(process.env.AMAZON_STORED_REPARSE_MAX_SINGLE_FILE_BYTES ?? 25 * 1024 * 1024);
export const AMAZON_STORED_REPARSE_MAX_AGGREGATE_CELLS = Number(process.env.AMAZON_STORED_REPARSE_MAX_AGGREGATE_CELLS ?? 5_000_000);
export const AMAZON_STORED_REPARSE_MAX_ARCHIVE_FILES = Number(process.env.AMAZON_STORED_REPARSE_MAX_ARCHIVE_FILES ?? 100);

type StoredAmazonFile = { fileSizeBytes: number; entryName: string | null; candidateTablesJson: string | null };

export function validateStoredAmazonReparseManifest(files: StoredAmazonFile[]) {
  if (!files.length) throw new Error("Stored Amazon source files are unavailable.");
  if (files.length > AMAZON_STORED_REPARSE_MAX_FILES) throw new Error("Stored Amazon draft contains too many files to reparse safely.");
  let totalBytes = 0;
  let totalCells = 0;
  let archiveFiles = 0;
  for (const file of files) {
    if (!Number.isSafeInteger(file.fileSizeBytes) || file.fileSizeBytes < 0 || file.fileSizeBytes > AMAZON_STORED_REPARSE_MAX_SINGLE_FILE_BYTES) throw new Error("A stored Amazon file exceeds the safe reparse size limit.");
    totalBytes += file.fileSizeBytes;
    totalCells += parseAmazonCandidateTables(file.candidateTablesJson, { includeReference: true }).reduce((sum, table) => sum + table.cellCount, 0);
    if (file.entryName) archiveFiles += 1;
  }
  if (totalBytes > AMAZON_STORED_REPARSE_MAX_AGGREGATE_BYTES) throw new Error("Stored Amazon draft exceeds the aggregate reparse size limit.");
  if (totalCells > AMAZON_STORED_REPARSE_MAX_AGGREGATE_CELLS) throw new Error("Stored Amazon draft exceeds the aggregate parsed-cell limit.");
  if (archiveFiles > AMAZON_STORED_REPARSE_MAX_ARCHIVE_FILES) throw new Error("Stored Amazon draft contains too many archive-derived files.");
  return { fileCount: files.length, totalBytes, totalCells, archiveFiles, shipmentCandidateCount: files.reduce((sum, file) => sum + amazonShipmentCandidates(file.candidateTablesJson).length, 0) };
}
