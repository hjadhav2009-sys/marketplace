import React, { type ReactNode } from "react";
import { StatusBadge } from "@/components/StatusBadge";

export function WorkCardContext({ marketplace, source, stage, status }: { marketplace: string; source: string; stage: string; status: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <p className="min-w-0 break-words text-xs font-semibold uppercase tracking-wide text-slate-600">
        {source}<span aria-hidden="true"> · </span>{marketplace}<span aria-hidden="true"> / </span>{stage}
      </p>
      <StatusBadge value={status} />
    </div>
  );
}

const stateClasses = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  success: "border-teal-200 bg-teal-50 text-teal-900",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  danger: "border-rose-200 bg-rose-50 text-rose-900",
} as const;

export function WorkCardState({ children, title, tone = "neutral" }: { children?: ReactNode; title: ReactNode; tone?: keyof typeof stateClasses }) {
  return (
    <div className={`rounded-md border px-3 py-2.5 ${stateClasses[tone]}`} data-work-card-state={tone}>
      <p className="text-sm font-semibold">{title}</p>
      {children ? <div className="mt-1 break-words text-sm leading-5">{children}</div> : null}
    </div>
  );
}

export function WorkCardActions({ children, mode }: { children: ReactNode; mode: "ready" | "problem" | "completed" | "read-only" }) {
  return <div className="grid min-w-0 grid-cols-2 gap-2" data-action-mode={mode}>{children}</div>;
}

export function WorkCardDisclosure({ children, label }: { children: ReactNode; label: ReactNode }) {
  return (
    <details className="group min-w-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-sm font-semibold text-berry marker:content-none">
        <span>{label}</span>
        <svg aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </summary>
      <div className="min-w-0 pb-3 text-sm text-slate-700">{children}</div>
    </details>
  );
}

export function WorkCardMetadata({ children }: { children: ReactNode }) {
  return <dl className="grid min-w-0 gap-x-4 gap-y-2 sm:grid-cols-2">{children}</dl>;
}

export function WorkCardMetadataItem({ label, value }: { label: ReactNode; value: ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="break-all font-medium text-slate-800">{value}</dd></div>;
}
