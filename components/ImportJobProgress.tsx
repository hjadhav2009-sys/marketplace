"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { importJobElapsedSeconds, importJobEstimatedRemainingSeconds, importJobProgressPercent, importJobRowsPerSecond, isTerminalImportJobStatus } from "@/src/lib/import-jobs/progress";
import type { ImportJobRecord } from "@/src/lib/import-jobs/store";

type ImportJobProgressProps = {
  initialJob: ImportJobRecord;
  accountLabel: string;
};

type ImportJobJson = Omit<ImportJobRecord, "startedAt" | "finishedAt" | "createdAt" | "updatedAt"> & {
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function labelForImportType(importType: string) {
  if(importType==="FLIPKART_PRODUCT_INVENTORY")return "Flipkart Product Inventory Refresh";
  if(importType==="AMAZON_PRODUCT_INVENTORY")return "Amazon Product Inventory Refresh";
  return importType === "FLIPKART_LISTING_MASTER" ? "Flipkart Listing Master" : "Flipkart Order Excel";
}

function purposeForImportType(importType: string) {
  if (importType.endsWith("PRODUCT_INVENTORY") || importType.includes("LISTING") || importType.includes("CATALOG")) return "Product Inventory Refresh";
  if (importType.includes("ORDER")) return "Daily Customer Orders";
  if (importType.includes("CONSIGNMENT") || importType.includes("SHIPMENT")) return "New Consignment";
  return "Marketplace Import";
}

function reviewHref(job: ImportJobJson | ImportJobRecord) {
  if (!job.batchId) {
    return null;
  }

  return job.importType === "FLIPKART_LISTING_MASTER" ? `/owner/sku-mappings/import?batchId=${job.batchId}` : `/owner/uploads/${job.batchId}/review`;
}

function elapsedLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  if (minutes <= 0) {
    return `${remainder}s`;
  }

  return `${minutes}m ${remainder}s`;
}

function exportHref(jobId: string, format: "csv" | "xlsx" | "txt", type: "summary" | "issues" = "summary") {
  return `/owner/imports/export?jobId=${encodeURIComponent(jobId)}&format=${format}&type=${type}`;
}

export function ImportJobProgress({ initialJob, accountLabel }: ImportJobProgressProps) {
  const [job, setJob] = useState<ImportJobJson>(() => ({
    ...initialJob,
    startedAt: initialJob.startedAt?.toISOString() ?? null,
    finishedAt: initialJob.finishedAt?.toISOString() ?? null,
    createdAt: initialJob.createdAt.toISOString(),
    updatedAt: initialJob.updatedAt.toISOString()
  }));
  const calculatedProgress = importJobProgressPercent(job);
  const [progress, setProgress] = useState(calculatedProgress);
  const elapsedSeconds = importJobElapsedSeconds(job);
  const rowsPerSecond = importJobRowsPerSecond(job);
  const remainingSeconds = importJobEstimatedRemainingSeconds(job);
  const href = reviewHref(job);
  const isDone = isTerminalImportJobStatus(job.status);
  const issueCount = job.errorRows + job.warningRows;
  const [refreshState, setRefreshState] = useState<"idle" | "refreshing">("idle");

  const stats = useMemo(
    () => [
      ["Rows read", job.processedRows],
      ["Rows accepted", Math.max(0, job.processedRows - job.errorRows)],
      ["Rows inserted", job.createdRows],
      ["Rows enriched", job.updatedRows],
      ["Rows unchanged", job.unchangedRows],
      ["Current stage", job.stage],
      ["Processed files", `${job.processedFiles} / ${job.totalFiles}`],
      ["Current file", job.currentFile ?? "-"],
      ["Warnings", job.warningRows],
      ["Blocking errors", job.errorRows],
      ["Elapsed", elapsedLabel(elapsedSeconds)],
      ["Rows/sec", rowsPerSecond],
      ["Remaining", remainingSeconds > 0 ? elapsedLabel(remainingSeconds) : isDone ? "Done" : "Calculating"]
    ],
    [elapsedSeconds, isDone, job, remainingSeconds, rowsPerSecond]
  );

  useEffect(() => {
    setProgress((current) => Math.max(current, calculatedProgress));
  }, [calculatedProgress]);

  useEffect(() => {
    if (isDone) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setInterval(async () => {
      try {
        setRefreshState("refreshing");
        const response = await fetch(`/owner/imports/${job.id}/status`, {
          signal: controller.signal,
          cache: "no-store"
        });

        if (response.ok) {
          const payload = (await response.json()) as { job: ImportJobJson };
          setJob(payload.job);
        }
      } catch {
        // The next poll will retry.
      } finally {
        setRefreshState("idle");
      }
    }, 1500);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [isDone, job.id]);

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-berry">{labelForImportType(job.importType)}</p>
          <h2 className="mt-1 break-words text-xl font-bold text-slate-950">{job.fileName}</h2>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <span>Marketplace: <b className="text-slate-950">{job.marketplace}</b></span>
            <span>Seller account: <b className="text-slate-950">{accountLabel}</b></span>
            <span>Purpose: <b className="text-slate-950">{purposeForImportType(job.importType)}</b></span>
          </div>
          <p className="mt-2 text-sm text-slate-600">Status: <span className={`font-black ${job.status === "COMPLETED" ? "text-teal-700" : job.status === "COMPLETED_WITH_WARNINGS" ? "text-amber-700" : job.status === "FAILED" ? "text-rose-700" : "text-slate-950"}`}>{job.status.replaceAll("_", " ")}</span> / Started {formatDateTime(job.startedAt)}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {isDone ? `Finished ${formatDateTime(job.finishedAt)}` : "Live progress refreshes every 1.5 seconds."}
            {refreshState === "refreshing" ? <span className="ml-2 inline-block h-2 w-12 animate-pulse rounded-full bg-slate-200 align-middle" /> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(job.status === "COMPLETED" || job.status === "COMPLETED_WITH_WARNINGS") && href ? (
            <Link href={href} className="inline-flex rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
              Open review
            </Link>
          ) : null}
          <Link href={job.importType.endsWith("PRODUCT_INVENTORY") ? "/owner/product-inventory/refresh" : "/owner/imports"} className="inline-flex rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800">
            Start New Import
          </Link>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
          <span>{progress}%</span>
          <span>{job.processedRows} / {job.totalRows} rows</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full transition-all ${job.status === "FAILED" ? "bg-rose-600" : job.status === "COMPLETED_WITH_WARNINGS" ? "bg-amber-500" : job.status === "COMPLETED" ? "bg-teal-600" : "bg-berry"}`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 break-words text-lg font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      {job.lastError ? (
        <div className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {job.lastError}
        </div>
      ) : null}

      <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
        <h3 className="font-semibold text-slate-950">{job.status === "FAILED" ? "Job failed" : job.status === "COMPLETED_WITH_WARNINGS" ? "Completed with warnings" : job.status === "COMPLETED" ? "Completed" : "Next actions"}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/owner/imports" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800">
            Back to imports
          </Link>
          {job.importType.endsWith("PRODUCT_INVENTORY") ? <Link href="/owner/product-inventory" className="rounded-md bg-slate-950 px-3 py-2 text-sm font-bold text-white">View Product Inventory</Link> : null}
          {job.importType.includes("ORDER") ? <Link href="/picker" className="rounded-md bg-slate-950 px-3 py-2 text-sm font-bold text-white">Open Customer Orders</Link> : null}
          <Link href={exportHref(job.id, "csv")} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800">
            Summary CSV
          </Link>
          <Link href={exportHref(job.id, "xlsx")} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800">
            Summary XLSX
          </Link>
          <Link href={exportHref(job.id, "txt")} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800">
            Summary TXT
          </Link>
          {job.warningRows > 0 && job.batchId ? (
            <>
              <Link href={`/owner/imports/${job.id}/issues?kind=warning`} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
                View Warnings ({job.warningRows})
              </Link>
              <Link href={exportHref(job.id, "csv", "issues")} className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm font-bold text-amber-900">
                Issues CSV
              </Link>
            </>
          ) : null}
          {job.errorRows > 0 && job.batchId ? <Link href={`/owner/imports/${job.id}/issues?kind=error`} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800">View Blocking Errors ({job.errorRows})</Link> : null}
          {issueCount === 0 && job.status === "COMPLETED" ? (
            <span className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-bold text-teal-800">No issues recorded</span>
          ) : null}
        </div>
        {job.status === "FAILED" ? (
          <p className="mt-3 text-sm text-slate-600">
            Retry appears on the job page only when the retained source file is still available in private import-job storage.
          </p>
        ) : null}
      </div>
    </section>
  );
}
