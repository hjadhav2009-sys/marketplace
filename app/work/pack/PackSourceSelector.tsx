"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { packSourceLabel, type PackSource, type PackSummary } from "@/src/lib/workflow/pack-workspace";

export function PackSourceSelector({ initial, selectedSource, sources }: { initial: PackSummary; selectedSource: PackSource | null; sources: readonly PackSource[] }) {
  const [summary, setSummary] = useState(initial);
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ summary: PackSummary }>).detail;
      if (detail?.summary) setSummary(detail.summary);
    };
    window.addEventListener("work-summary-change", update);
    return () => window.removeEventListener("work-summary-change", update);
  }, []);
  if (sources.length < 2) return null;
  return <nav aria-label="Packing work source" className="mb-4 grid gap-2 md:grid-cols-2" data-pack-source-selector>
    {sources.map((source) => {
      const item = summary[source], selected = source === selectedSource;
      const noun = source === "ORDER" ? `${item.cardCount} open packages` : `${item.cardCount} open lines`;
      return <Link key={source} href={`/work/pack?source=${source}`} aria-current={selected ? "true" : undefined} className={`min-h-11 min-w-0 rounded-md border px-3 py-3 transition-colors motion-reduce:transition-none ${selected ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-900 hover:border-berry"}`}>
        <span className="flex min-w-0 items-baseline justify-between gap-3"><span className="truncate text-sm font-semibold">{packSourceLabel(source)}</span><span className="shrink-0 text-sm font-semibold tabular-nums">{noun}</span></span>
        <span className={`mt-1 block text-xs leading-5 ${selected ? "text-slate-200" : "text-slate-600"}`}>{item.itemCount} {source === "ORDER" ? "order items" : "lines"} <span aria-hidden="true">·</span> {item.requiredQuantity} units <span aria-hidden="true">·</span> {item.problems} problems</span>
        <span className={`block truncate text-xs ${selected ? "text-slate-300" : "text-slate-500"}`}>{item.assignedToMe} assigned to me</span>
      </Link>;
    })}
  </nav>;
}
