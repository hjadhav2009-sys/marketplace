"use client";

import Link from "next/link";
import { reassignConsignmentProblemWorkspaceAction, resolveConsignmentProblemWorkspaceAction, resolveOrderProblemWorkspaceAction } from "@/app/work/problems/actions";
import type { ProblemWorkspaceItem } from "@/src/lib/workflow/problems-workspace";
import { ProductImage } from "./ProductImage";
import { SubmitButton } from "./SubmitButton";
import { formatDateTime } from "@/lib/format";
import { FeedbackBanner } from "./ui/FeedbackBanner";
import { fieldControlStyles } from "./ui/Field";
import { buttonStyles } from "./ui/buttonStyles";
import { useWorkerOverlay } from "./worker-overlay/WorkerOverlay";

export function ProblemWorkspaceCard({ item, returnPath, mutationRequestBase }: { item: ProblemWorkspaceItem; returnPath: string; mutationRequestBase: string }) {
  const { openOverlay } = useWorkerOverlay();
  const reported = item.reportedAt.getTime() ? formatDateTime(item.reportedAt) : "Time unavailable";
  return <article className="overflow-hidden rounded-xl border border-slate-200 bg-white" data-problem-card data-problem-source={item.source} data-problem-stage={item.stage}>
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{item.source === "ORDER" ? "Customer Order" : "Consignment"}</span><span className="text-xs text-slate-500">{item.marketplace}</span></div><span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-900">Work paused · {stageLabel(item.stage)}</span></header>
    <div className="grid gap-5 p-4 sm:grid-cols-[5rem_minmax(0,1fr)] sm:p-5 lg:grid-cols-[5rem_minmax(0,1fr)_15rem]">
      <ProductImage src={item.productImageUrl} alt={item.productTitle ?? item.sellerSku ?? "Problem work"} size="scanner" showBadge={false}/>
      <div className="min-w-0"><p className="break-all text-sm font-semibold text-berry">{item.reference}</p><h2 className="mt-1 break-words text-lg font-semibold text-slate-950">{item.productTitle ?? item.sellerSku ?? "Operational work"}</h2>{item.sellerSku ? <p className="mt-1 break-all text-sm text-slate-600">Seller SKU {item.sellerSku}</p> : null}<div className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-950"><p className="font-semibold">{humanReason(item.reason)}</p>{item.note ? <p className="mt-1 whitespace-pre-wrap">{item.note}</p> : null}</div><dl className="mt-4 grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2"><Meta label="Interrupted stage" value={stageLabel(item.stage)}/><Meta label="Quantity" value={`${item.completedQuantity} of ${item.requiredQuantity}`}/><Meta label="Assignment" value={item.assignedUserName ?? "Unassigned"}/><Meta label="Reported" value={`${item.reporterName ?? "Recorded worker"} · ${reported}`}/></dl></div>
      <div className="grid content-start gap-2 sm:col-span-2 sm:grid-cols-2 lg:col-span-1 lg:grid-cols-1">
        {item.canResolve ? <button type="button" className={buttonStyles({ className: "w-full" })} onClick={() => openOverlay({ id: `problem-resolve:${item.source}:${item.id}`, kind: "PROBLEM", surface: "dialog", title: "Resolve problem", content: <ResolveProblemForm item={item} returnPath={returnPath} mutationRequestBase={mutationRequestBase}/> })}>Resolve</button> : null}
        {item.canReassign ? <button type="button" className={buttonStyles({ variant: "secondary", className: "w-full" })} onClick={() => openOverlay({ id: `problem-reassign:${item.id}`, kind: "PROBLEM", surface: "dialog", title: "Reassign problem work", content: <ReassignProblemForm item={item} returnPath={returnPath} mutationRequestBase={mutationRequestBase}/> })}>Reassign</button> : null}
        <button type="button" className={buttonStyles({ variant: "quiet", className: "w-full" })} onClick={() => openOverlay({ id: `problem-details:${item.source}:${item.id}`, kind: "DETAILS", surface: "drawer", title: "Problem details", content: <ProblemDetails item={item}/> })}>Details</button>
      </div>
    </div>
  </article>;
}

function ResolveProblemForm({ item, returnPath, mutationRequestBase }: { item: ProblemWorkspaceItem; returnPath: string; mutationRequestBase: string }) {
  const action = item.source === "ORDER" ? resolveOrderProblemWorkspaceAction : resolveConsignmentProblemWorkspaceAction;
  return <form action={action} className="grid gap-4">
    <FeedbackBanner tone="warning" title={humanReason(item.reason)}>Only {stageLabel(item.stage)} resumes. Completed upstream work stays completed.</FeedbackBanner>
    <dl className="grid grid-cols-2 gap-3 rounded-md bg-slate-50 p-3 text-sm"><Meta label="Affected stage" value={stageLabel(item.stage)}/><Meta label="Current quantity" value={`${item.completedQuantity} of ${item.requiredQuantity}`}/></dl>
    <input type="hidden" name="problemId" value={item.id}/><input type="hidden" name="taskId" value={item.taskId}/><input type="hidden" name="returnPath" value={returnPath}/><input type="hidden" name="clientRequestId" value={`problem:${item.source}:${item.id}:resolve:${mutationRequestBase}`}/>
    <label className="text-sm font-semibold text-slate-900">Resolution note<textarea name="resolutionNote" required maxLength={1000} className={fieldControlStyles({ className: "mt-2 min-h-28" })} placeholder="What was checked or corrected?"/></label>
    <SubmitButton pendingText="Resolving..." className="w-full">Resolve and return to work</SubmitButton>
  </form>;
}

function ReassignProblemForm({ item, returnPath, mutationRequestBase }: { item: ProblemWorkspaceItem; returnPath: string; mutationRequestBase: string }) {
  return <form action={reassignConsignmentProblemWorkspaceAction} className="grid gap-4">
    <FeedbackBanner tone="info" title="Problem stays open">Reassignment changes ownership only. It does not resolve the problem.</FeedbackBanner>
    <input type="hidden" name="taskId" value={item.taskId}/><input type="hidden" name="returnPath" value={returnPath}/><input type="hidden" name="clientRequestId" value={`problem:${item.id}:assign:${mutationRequestBase}`}/>
    <label className="text-sm font-semibold text-slate-900">Authorized {stageLabel(item.stage)} worker<select name="assignedUserId" defaultValue={item.assignedUserId ?? ""} className={fieldControlStyles({ className: "mt-2" })}><option value="">Unassigned</option>{item.eligibleWorkers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></label>
    <SubmitButton pendingText="Assigning..." variant="secondary" className="w-full">Update assignment</SubmitButton>
  </form>;
}

function ProblemDetails({ item }: { item: ProblemWorkspaceItem }) { return <div className="grid gap-5"><div><p className="text-lg font-semibold text-slate-950">{item.productTitle ?? item.sellerSku ?? "Operational work"}</p><p className="mt-1 break-all text-sm text-slate-600">{item.reference}</p></div><dl className="divide-y divide-slate-100 rounded-md border border-slate-200 px-3"><Detail label="Source" value={item.source === "ORDER" ? "Customer Order" : "Consignment"}/><Detail label="Stage" value={stageLabel(item.stage)}/><Detail label="Reason" value={humanReason(item.reason)}/><Detail label="Status before problem" value={item.taskStatusBefore?.replaceAll("_", " ").toLowerCase() ?? "Not recorded"}/><Detail label="Assignment" value={item.assignedUserName ?? "Unassigned"}/><Detail label="Reporter" value={item.reporterName ?? "Recorded worker"}/></dl><Link href={item.detailsHref} className={buttonStyles({ variant: "secondary", className: "w-full" })}>Open full record</Link></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)]"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="break-words text-sm font-medium text-slate-900">{value}</dd></div>; }
function Meta({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-0.5 break-words font-medium text-slate-900">{value}</dd></div>; }
function stageLabel(stage: string) { return stage === "MARK" ? "Marking" : stage === "ASSEMBLE" ? "Assembly" : stage === "PACK" ? "Pack" : "Pick"; }
function humanReason(reason: string) { return reason.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase()); }
