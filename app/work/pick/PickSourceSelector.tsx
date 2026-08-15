"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  pickSourceLabel,
  type PickSource,
  type PickSummary,
} from "@/src/lib/workflow/pick-workspace";

export function PickSourceSelector({
  initial,
  selectedSource,
  supportedSources,
}: {
  initial: PickSummary;
  selectedSource: PickSource;
  supportedSources: readonly PickSource[];
}) {
  const [summary, setSummary] = useState(initial);

  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ summary: PickSummary }>).detail;
      if (detail?.summary) setSummary(detail.summary);
    };
    window.addEventListener("work-summary-change", update);
    return () => window.removeEventListener("work-summary-change", update);
  }, []);

  if (supportedSources.length < 2) return null;

  return (
    <nav aria-label="Pick work source" className="mb-4 grid grid-cols-2 gap-2" data-pick-source-selector>
      {supportedSources.map((source) => {
        const selected = selectedSource === source;
        const item = summary[source];
        return (
          <Link
            key={source}
            href={`/work/pick?source=${source}`}
            aria-current={selected ? "true" : undefined}
            className={`flex min-h-16 min-w-0 flex-col justify-center rounded-md border px-3 py-2 text-left transition-colors motion-reduce:transition-none ${selected ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-800 hover:border-berry"}`}
          >
            <span className="truncate text-sm font-semibold">{pickSourceLabel(source)}</span>
            <span className={`mt-0.5 truncate text-xs tabular-nums ${selected ? "text-slate-200" : "text-slate-600"}`}>
              {item.itemCount} items <span aria-hidden="true">&middot;</span> {item.requiredQuantity} units
            </span>
            {item.problems > 0 || item.assignedToMe > 0 ? (
              <span className={`mt-0.5 truncate text-xs ${selected ? "text-slate-200" : "text-slate-600"}`}>
                {item.problems > 0 ? `${item.problems} problem${item.problems === 1 ? "" : "s"}` : null}
                {item.problems > 0 && item.assignedToMe > 0 ? <span aria-hidden="true"> &middot; </span> : null}
                {item.assignedToMe > 0 ? `${item.assignedToMe} assigned to me` : null}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
