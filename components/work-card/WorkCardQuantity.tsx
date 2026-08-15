import React from "react";
import { WorkCardState } from "./WorkCardSections";

type WorkCardQuantityProps = {
  assignment: string;
  completed: number;
  itemCount?: number;
  label?: string;
  mode?: "standard" | "package";
  required: number;
  stage: string;
};

function isValidQuantity(required: number, completed: number) {
  return Number.isFinite(required) && Number.isFinite(completed) && required >= 0 && completed >= 0 && completed <= required;
}

export function WorkCardQuantity({ assignment, completed, itemCount, label = "Quantity to process", mode = "standard", required, stage }: WorkCardQuantityProps) {
  if (!isValidQuantity(required, completed)) {
    return <WorkCardState tone="danger" title="Quantity data needs review">Required and completed quantities are inconsistent. Processing controls remain governed by the existing workflow state.</WorkCardState>;
  }

  if (mode === "package") {
    return (
      <section className="rounded-md bg-slate-50 px-3 py-2.5" aria-label="Package quantity">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Package quantity</p>
        <p className="mt-1 text-sm font-semibold tabular-nums text-slate-950"><span className="sr-only">Item count </span>{itemCount ?? 1} items <span aria-hidden="true">·</span> <span className="sr-only">Total units </span>{required} units</p>
        <p className="mt-1 break-words text-xs text-slate-600">{assignment}</p>
      </section>
    );
  }

  const pending = required - completed;
  const percent = required === 0 ? 0 : Math.min(100, completed / required * 100);
  return (
    <section className="rounded-md bg-slate-50 px-3 py-2.5" aria-label={`${stage} quantity`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-slate-950"><span className="sr-only">Required </span>{required} required <span aria-hidden="true">·</span> <span className="sr-only">Completed </span>{completed} done <span aria-hidden="true">·</span> <span className="sr-only">Pending </span>{pending} remaining</p>
      <div role="progressbar" aria-label={`${stage} quantity completed`} aria-valuemin={0} aria-valuemax={required} aria-valuenow={completed} className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-teal-600" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1.5 break-words text-xs text-slate-600">{assignment}</p>
    </section>
  );
}
