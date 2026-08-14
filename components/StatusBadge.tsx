import React from "react";
import { titleCase } from "@/lib/format";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "error";

export const statusTone: Record<string, StatusTone> = {
  READY: "info",
  FOUND: "info",
  RUNNING: "info",
  PARSING: "info",
  MERGING: "info",
  REVIEWED: "info",
  PARSED: "info",
  IN_PROGRESS: "info",
  ACTIVATING: "info",
  READY_TO_ACTIVATE: "info",
  PACKED: "success",
  PICKED: "success",
  RESOLVED: "success",
  IMPORTED: "success",
  COMPLETED: "success",
  ACTIVE: "success",
  OK: "success",
  CACHED: "success",
  MAPPED: "success",
  OWNER_SELECTED: "success",
  EXACT_SKU: "success",
  EXACT_FSN: "success",
  EXACT_FNSKU: "success",
  EXACT_ASIN: "success",
  EXACT_EXTERNAL_ID: "success",
  EXACT_BARCODE: "success",
  WARNING: "warning",
  MISSING_IMAGE: "warning",
  COMPLETED_WITH_WARNINGS: "warning",
  PASSWORD_REQUIRED: "warning",
  REVIEW_REQUIRED: "warning",
  NEEDS_MAPPING: "warning",
  AWAITING_FILE_ROLES: "warning",
  RECHECK_NEEDED: "warning",
  EXACT_MULTIPLE: "warning",
  FAILED_RESTORED: "warning",
  PROBLEM: "error",
  OPEN: "error",
  NOT_FOUND: "error",
  NEEDS_ACTION: "error",
  FAILED: "error",
  BROKEN: "error",
  INVALID: "error",
  IDENTIFIER_CONFLICT: "error",
  QUEUED: "neutral",
  UPLOADED: "neutral",
  INACTIVE: "neutral",
  CANCELLED: "neutral",
  DRAFT: "neutral",
  LOCKED: "neutral",
  SKIPPED: "neutral",
  NOT_CACHED: "neutral",
  OWNER: "neutral",
  PICKER: "neutral",
  PACKER: "neutral",
};

const toneClass: Record<StatusTone, string> = {
  neutral: "ui-state--neutral",
  info: "ui-state--info",
  success: "ui-state--success",
  warning: "ui-state--warning",
  error: "ui-state--error",
};

function StatusMarker({ tone }: { tone: StatusTone }) {
  if (tone === "success") return <path d="m2 5 2 2 4-5" />;
  if (tone === "warning") return <path d="M5 2v4M5 8.25h.01" />;
  if (tone === "error") return <path d="m2 2 6 6M8 2 2 8" />;
  if (tone === "info") return <path d="M5 4.25V8M5 2h.01" />;
  return <path d="M2 5h6" />;
}

export function StatusBadge({ value }: { value: string }) {
  const tone = statusTone[value] ?? "neutral";
  const label = titleCase(value);
  const wrapLongLabel = label.length > 20;

  return (
    <span className={`ui-status-badge ${toneClass[tone]}`} data-status={value} data-tone={tone}>
      <svg aria-hidden="true" className="ui-status-badge__marker" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <StatusMarker tone={tone} />
      </svg>
      <span className={`ui-status-badge__label${wrapLongLabel ? " ui-status-badge__label--wrap" : ""}`}>{label}</span>
    </span>
  );
}
