"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { markSourceLabel, type MarkSource, type MarkSummary } from "@/src/lib/workflow/mark-workspace";

export function MarkSourceSelector({ initial, selectedSource, sources }: { initial: MarkSummary; selectedSource: MarkSource | null; sources: readonly MarkSource[] }) {
  const [summary, setSummary] = useState(initial);
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ summary: MarkSummary }>).detail;
      if (detail?.summary) setSummary(detail.summary);
    };
    window.addEventListener("work-summary-change", update);
    return () => window.removeEventListener("work-summary-change", update);
  }, []);
  if (sources.length < 2) return null;

  return (
    <nav aria-label="Marking work source" className="mb-4 grid gap-2 md:grid-cols-2" data-mark-source-selector>
      {sources.map((source) => {
        const item = summary[source];
        const selected = source === selectedSource;
        return (
          <Link key={source} href={`/work/mark?source=${source}`} aria-current={selected ? "true" : undefined} className={`min-w-0 rounded-md border px-3 py-3 transition-colors motion-reduce:transition-none ${selected ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-900 hover:border-berry"}`}>
            <span className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="truncate text-sm font-semibold">{markSourceLabel(source)}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{item.cardCount} open</span>
            </span>
            <span className={`mt-1 block text-xs leading-5 ${selected ? "text-slate-200" : "text-slate-600"}`}>
              {item.requiredQuantity} units <span aria-hidden="true">&middot;</span> {item.problems} problems <span aria-hidden="true">&middot;</span> {item.assignedToMe} assigned to me
            </span>
            <span className={`block truncate text-xs ${selected ? "text-slate-300" : "text-slate-500"}`}>Oldest {item.oldestWaitingAt ? formatOperationalTime(item.oldestWaitingAt) : "none waiting"}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function formatOperationalTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}
