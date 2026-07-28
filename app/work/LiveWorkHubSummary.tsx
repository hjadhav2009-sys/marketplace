"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { WorkStage } from "@prisma/client";
import { formatDateTime } from "@/lib/format";
import type { StageSummary } from "./LiveStageSummary";

export function LiveWorkHubSummary({
  initial,
  access
}: {
  initial: Partial<Record<WorkStage, StageSummary>>;
  access: Partial<Record<WorkStage, "ACTION" | "READ_ONLY">>;
}) {
  const [summaries, setSummaries] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const events: EventSource[] = [];
    let cancelled = false;
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        try {
          const response = await fetch("/api/work/live/hub-summary", { cache: "no-store" });
          if (response.ok) setSummaries((await response.json() as { summaries: Partial<Record<WorkStage, StageSummary>> }).summaries);
        } catch {
          // The next live event will retry.
        }
      }, 120);
    };
    const start = async (stage: WorkStage) => {
      try {
        const query = new URLSearchParams({ stage });
        const bootstrap = await fetch(`/api/work/live/bootstrap?${query}`, { cache: "no-store" });
        if (!bootstrap.ok || cancelled || typeof EventSource === "undefined") return;
        const { cursor } = await bootstrap.json() as { cursor: number };
        if (cancelled) return;
        query.set("after", String(cursor));
        const stream = new EventSource(`/api/work/live?${query}`);
        events.push(stream);
        stream.onmessage = refresh;
      } catch {
        // A later page refresh can re-establish live updates.
      }
    };
    for (const stage of Object.keys(initial) as WorkStage[]) void start(stage);
    return () => {
      cancelled = true;
      for (const stream of events) stream.close();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [initial]);

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Available work stages">
      {Object.entries(summaries).map(([stage, value]) => {
        const summary = value!;
        const count = summary.ORDER.cardCount + summary.CONSIGNMENT.cardCount;
        const quantity = summary.ORDER.requiredQuantity + summary.CONSIGNMENT.requiredQuantity;
        const problems = summary.ORDER.problems + summary.CONSIGNMENT.problems;
        const assigned = summary.ORDER.assignedToMe + summary.CONSIGNMENT.assignedToMe;
        const oldest = [summary.ORDER.oldestWaitingAt, summary.CONSIGNMENT.oldestWaitingAt].filter(Boolean).sort()[0];
        return (
          <Link key={stage} href={`/work/${stage.toLowerCase()}`} className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-white shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-2xl font-black">{stage[0]}{stage.slice(1).toLowerCase()}</p>
              <span className="rounded-full bg-white/15 px-2 py-1 text-xs font-bold">{access[stage as WorkStage] === "ACTION" ? "Actions enabled" : "Read-only"}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-slate-300">Cards</dt><dd className="font-bold">{count}</dd></div>
              <div><dt className="text-slate-300">Units</dt><dd className="font-bold">{quantity}</dd></div>
              <div><dt className="text-slate-300">Assigned to me</dt><dd className="font-bold">{assigned}</dd></div>
              <div><dt className="text-slate-300">Problems</dt><dd className="font-bold">{problems}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-slate-300">{oldest ? `Oldest waiting: ${formatDateTime(oldest)}` : "No waiting work"}</p>
          </Link>
        );
      })}
    </section>
  );
}
