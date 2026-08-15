import React from "react";
import type { ManualMarkingGuidance, MarkingGuidance as Guidance } from "@/src/lib/workflow/marking-guidance";
import { WorkCardState } from "./WorkCardSections";

export function MarkingGuidance({ guidance, manual, missing = false }: { guidance?: Guidance | null; manual?: ManualMarkingGuidance | null; missing?: boolean }) {
  if (manual) {
    return (
      <WorkCardState tone="warning" title={manual.warning}>
        <p>Routed manually by an authorized worker at {formatOperationalTime(manual.routedAt)}.</p>
        {manual.workerNote ? <p className="mt-1 whitespace-pre-wrap font-medium">Worker note: {manual.workerNote}</p> : null}
        <p className="mt-1">Continue only with this approved manual guidance. No machine settings were invented.</p>
      </WorkCardState>
    );
  }

  if (missing || !guidance) {
    return (
      <WorkCardState tone="danger" title="Saved marking instructions unavailable">
        This work was routed to Marking without saved settings. Use approved manual guidance; no machine settings will be invented.
      </WorkCardState>
    );
  }

  const dimensions = guidance.widthMm != null && guidance.heightMm != null ? `${guidance.widthMm} × ${guidance.heightMm} mm` : "Not set";
  return (
    <section className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3" aria-label="Marking guidance" data-marking-guidance>
      <p className="text-xs font-semibold uppercase tracking-wide text-berry">Marking</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-950">
        {guidance.masterDesignId ? <>{guidance.masterDesignId}<span aria-hidden="true"> · </span></> : null}{guidance.designName}
      </p>
      <p className="mt-1 break-words text-sm text-slate-700">
        {[guidance.material, guidance.position, dimensions].filter(Boolean).join(" · ")}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
        <Setting label="Power" value={guidance.power} />
        <Setting label="Speed" value={guidance.speed} />
        <Setting label="Frequency" value={guidance.frequency} />
        <Setting label="Passes" value={guidance.passes} suffix={guidance.passes === 1 ? "pass" : "passes"} />
      </dl>
      {guidance.instructions ? <p className="mt-2 break-words text-sm leading-5 text-slate-700">{preview(guidance.instructions)}</p> : null}
    </section>
  );
}

function Setting({ label, value, suffix }: { label: string; value: number | null; suffix?: string }) {
  return <div className="min-w-0"><dt className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="break-words text-sm font-semibold tabular-nums text-slate-900">{value ?? "Not set"}{value != null && suffix ? ` ${suffix}` : ""}</dd></div>;
}

function preview(value: string) {
  return value.length <= 180 ? value : `${value.slice(0, 177).trimEnd()}…`;
}

function formatOperationalTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

export function MarkingDetails({ guidance }: { guidance: Guidance }) {
  const rows = [
    ["Master Design ID", guidance.masterDesignId],
    ["Design / asset", guidance.designName],
    ["Material", guidance.material],
    ["Position", guidance.position],
    ["Dimensions", guidance.widthMm != null && guidance.heightMm != null ? `${guidance.widthMm} × ${guidance.heightMm} mm` : null],
    ["Power", guidance.power],
    ["Speed", guidance.speed],
    ["Frequency", guidance.frequency],
    ["Passes", guidance.passes],
  ] as const;
  return <><dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="break-words text-sm font-medium text-slate-900">{value ?? "Not set"}</dd></div>)}</dl>{guidance.instructions ? <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{guidance.instructions}</p> : null}</>;
}
