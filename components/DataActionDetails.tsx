"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type DataActionTone = "quarantine" | "archive" | "restore" | "permanent";

const toneClasses: Record<DataActionTone, { shell: string; summary: string; divider: string; cancel: string }> = {
  quarantine: {
    shell: "border-amber-300 bg-amber-50",
    summary: "text-amber-950",
    divider: "border-amber-200",
    cancel: "border-amber-300 bg-white text-amber-950"
  },
  archive: {
    shell: "border-sky-300 bg-sky-50",
    summary: "text-sky-950",
    divider: "border-sky-200",
    cancel: "border-sky-300 bg-white text-sky-950"
  },
  restore: {
    shell: "border-emerald-300 bg-emerald-50",
    summary: "text-emerald-950",
    divider: "border-emerald-200",
    cancel: "border-emerald-300 bg-white text-emerald-950"
  },
  permanent: {
    shell: "border-rose-300 bg-rose-50",
    summary: "text-rose-900",
    divider: "border-rose-200",
    cancel: "border-rose-300 bg-white text-rose-900"
  }
};

export function DataActionDetails({
  label,
  tone,
  disabled = false,
  disabledReason,
  children
}: {
  label: string;
  tone: DataActionTone;
  disabled?: boolean;
  disabledReason?: string;
  children: ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const styles = toneClasses[tone];

  const close = () => {
    if (detailsRef.current) detailsRef.current.open = false;
    setOpen(false);
    summaryRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  if (disabled) {
    return <div className={`mt-3 rounded-xl border p-4 ${styles.shell}`} data-data-action-disabled data-action-tone={tone}>
      <p className={`text-sm font-bold ${styles.summary}`}>{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-700">{disabledReason ?? "This action is currently unavailable."}</p>
    </div>;
  }

  return <details
    ref={detailsRef}
    className={`mt-3 rounded-xl border ${styles.shell}`}
    data-data-action-details
    data-action-tone={tone}
    onToggle={(event) => setOpen(event.currentTarget.open)}
  >
    <summary ref={summaryRef} className={`flex min-h-11 cursor-pointer items-center px-4 py-3 text-sm font-bold ${styles.summary}`}>
      {label}
    </summary>
    <div className={`border-t p-4 ${styles.divider}`}>
      {children}
      <button type="button" onClick={close} className={`mt-3 min-h-11 w-full rounded-lg border px-4 py-2 font-bold sm:w-auto ${styles.cancel}`}>
        Cancel
      </button>
    </div>
  </details>;
}
