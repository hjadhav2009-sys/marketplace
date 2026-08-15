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
      <section className="rounded-md border border-slate-200 bg-slate-50 p-3" aria-label="Package quantity">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Package quantity</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <QuantityValue label="Item count" value={itemCount ?? 1} />
          <QuantityValue label="Total units" value={required} />
        </div>
        <p className="mt-3 break-words text-xs text-slate-500">{assignment}</p>
      </section>
    );
  }

  const pending = required - completed;
  const percent = required === 0 ? 0 : Math.min(100, completed / required * 100);
  return (
    <section className="rounded-md border border-slate-200 bg-slate-50 p-3" aria-label={`${stage} quantity`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <QuantityValue label="Required" value={required} />
        <QuantityValue label="Completed" value={completed} />
        <QuantityValue label="Pending" value={pending} />
      </div>
      <div role="progressbar" aria-label={`${stage} quantity completed`} aria-valuemin={0} aria-valuemax={required} aria-valuenow={completed} className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-teal-600" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-3 break-words text-xs text-slate-500">{assignment}</p>
    </section>
  );
}

function QuantityValue({ label, value }: { label: string; value: number }) {
  return <div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-950">{value}</p></div>;
}
