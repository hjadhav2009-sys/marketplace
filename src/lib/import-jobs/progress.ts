export const IMPORT_JOB_PAGE_SIZE = 10;
export const IMPORT_JOB_PAGE_SIZES = [10, 25, 50, 100] as const;

export type ImportJobProgressLike = {
  totalRows: number;
  processedRows: number;
  status?: string | null;
  startedAt?: Date | string | null;
  finishedAt?: Date | string | null;
};

export const TERMINAL_IMPORT_JOB_STATUSES = ["COMPLETED", "COMPLETED_WITH_WARNINGS", "FAILED", "CANCELLED"] as const;

export function isTerminalImportJobStatus(status: string | null | undefined) {
  return TERMINAL_IMPORT_JOB_STATUSES.includes(status as (typeof TERMINAL_IMPORT_JOB_STATUSES)[number]);
}

export function clampImportJobPage(page: number | string | null | undefined) {
  const parsed = typeof page === "number" ? page : Number.parseInt(page ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function importJobPageWindow(totalRows: number, page: number | string | null | undefined, pageSize = IMPORT_JOB_PAGE_SIZE) {
  const safePageSize = IMPORT_JOB_PAGE_SIZES.includes(pageSize as (typeof IMPORT_JOB_PAGE_SIZES)[number]) ? pageSize : IMPORT_JOB_PAGE_SIZE;
  const safeTotal = Math.max(0, totalRows);
  const currentPage = clampImportJobPage(page);
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const boundedPage = Math.min(currentPage, totalPages);
  const skip = (boundedPage - 1) * safePageSize;

  return {
    page: boundedPage,
    pageSize: safePageSize,
    totalPages,
    skip,
    take: safePageSize,
    from: safeTotal === 0 ? 0 : skip + 1,
    to: Math.min(skip + safePageSize, safeTotal)
  };
}

export function importJobProgressPercent(job: Pick<ImportJobProgressLike, "totalRows" | "processedRows" | "status">) {
  if (isTerminalImportJobStatus(job.status)) {
    return 100;
  }

  if (job.totalRows <= 0) {
    return job.processedRows > 0 ? 100 : 0;
  }

  return Math.max(0, Math.min(100, Math.round((job.processedRows / job.totalRows) * 100)));
}

export function importJobElapsedSeconds(job: ImportJobProgressLike, now = new Date()) {
  if (!job.startedAt) {
    return 0;
  }

  const start = new Date(job.startedAt).getTime();
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : now.getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  return Math.round((end - start) / 1000);
}

export function importJobRowsPerSecond(job: ImportJobProgressLike, now = new Date()) {
  const elapsed = importJobElapsedSeconds(job, now);

  if (elapsed <= 0) {
    return 0;
  }

  return Math.round((job.processedRows / elapsed) * 10) / 10;
}

export function importJobEstimatedRemainingSeconds(job: ImportJobProgressLike, now = new Date()) {
  const rowsPerSecond = importJobRowsPerSecond(job, now);

  if (rowsPerSecond <= 0 || job.totalRows <= 0 || job.processedRows >= job.totalRows) {
    return 0;
  }

  return Math.ceil((job.totalRows - job.processedRows) / rowsPerSecond);
}
