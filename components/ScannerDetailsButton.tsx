"use client";

import Link from "next/link";
import type { UniversalWorkCandidate } from "@/src/lib/workflow/universal-resolver";
import { buttonStyles } from "./ui/buttonStyles";
import { useWorkerOverlay } from "./worker-overlay/WorkerOverlay";

export function ScannerDetailsButton({ candidate, href }: { candidate: UniversalWorkCandidate; href: string }) {
  const { openOverlay } = useWorkerOverlay();
  return <button
    type="button"
    className={buttonStyles({ variant: "secondary", className: "w-full" })}
    onClick={() => openOverlay({
      id: `scanner-details:${candidate.candidateKey}`,
      kind: "DETAILS",
      surface: "drawer",
      title: "Work details",
      content: <ScannerDetails candidate={candidate} href={href} />,
    })}
  >Details</button>;
}

function ScannerDetails({ candidate, href }: { candidate: UniversalWorkCandidate; href: string }) {
  const rows = [
    ["Source", candidate.sourceLabel],
    ["Marketplace", candidate.marketplace],
    ["Seller account", candidate.accountName],
    ["Reference", candidate.displayReference],
    ["Seller SKU", candidate.sellerSku],
    ["Stage", candidate.stage ? `${candidate.stage[0]}${candidate.stage.slice(1).toLowerCase()}` : null],
    ["Status", candidate.status.replaceAll("_", " ").toLowerCase()],
    ["Quantity", `${candidate.completedQuantity} of ${candidate.requiredQuantity}`],
    ["Assignment", candidate.assignedUserName ?? "Unassigned"],
    ["Matched by", candidate.matchType.replaceAll("_", " ").toLowerCase()],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return <div className="grid gap-5">
    <div><p className="break-words text-lg font-semibold text-slate-950">{candidate.productTitle ?? candidate.productSummary ?? candidate.sellerSku ?? "Operational work"}</p>{candidate.problemReason ? <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950">Problem: {candidate.problemReason.replaceAll("_", " ").toLowerCase()}</p> : null}</div>
    <dl className="divide-y divide-slate-100 rounded-md border border-slate-200 px-3">
      {rows.map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[8rem_minmax(0,1fr)]"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="break-all text-sm font-medium text-slate-900">{value}</dd></div>)}
    </dl>
    {candidate.readOnlyReason ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">{candidate.readOnlyReason}</p> : null}
    <Link href={href} className={buttonStyles({ variant: "secondary", className: "w-full" })}>Open full record</Link>
  </div>;
}
