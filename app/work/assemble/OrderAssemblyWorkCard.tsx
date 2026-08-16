"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import type { User } from "@prisma/client";
import { SubmitButton } from "@/components/SubmitButton";
import { WorkImageGallery } from "@/components/WorkImageGallery";
import { AssemblyDetails, AssemblyGuidance } from "@/components/work-card/AssemblyGuidance";
import { WorkCard, WorkCardActions, WorkCardContext, WorkCardIdentity, WorkCardQuantity, WorkCardState, WorkProcessFlow } from "@/components/work-card";
import { Field, fieldControlStyles } from "@/components/ui/Field";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { useWorkerOverlay } from "@/components/worker-overlay/WorkerOverlay";
import type { OrderAssemblyQueueTask } from "@/src/lib/workflow/order-assembly";
import { ORDER_ASSEMBLY_PROBLEM_CATEGORIES } from "@/src/lib/workflow/order-assembly-contract";
import { resolveAssemblyGuidance } from "@/src/lib/workflow/assembly-guidance";
import { resolveWorkRoutePresentation } from "@/src/lib/workflow/work-route-presentation";
import { claimOrderAssemblyAction, completeOrderAssemblyAction, reassignOrderAssemblyAction, reportOrderAssemblyProblemAction, resolveOrderAssemblyProblemAction, setOrderAssemblyProgressAction, skipOrderAssemblyAction } from "../assembly/actions";

export function OrderAssemblyWorkCard({ task, user, workers }: { task: OrderAssemblyQueueTask; user: User; workers: Array<{ id: string; name: string }> }) {
  const order = task.order;
  const { openOverlay } = useWorkerOverlay();
  const requestId = useId();
  if (!order) return null;
  const guidance = resolveAssemblyGuidance({ metadataJson: task.metadataJson, workCardSnapshotJson: task.workCardSnapshotJson, routeSnapshotJson: task.routeSnapshotJson });
  const route = resolveWorkRoutePresentation({ routeSnapshotJson: task.routeSnapshotJson, metadataJson: task.metadataJson, savedProcessRoute: null, currentStage: "ASSEMBLE" });
  // Keep this client surface independent from the server-only permission module.
  // AppShell/page data remains authoritative; this mirrors its OWNER override.
  const canAssemble = user.role === "OWNER" || user.canAssemble;
  const assignmentAllows = user.role === "OWNER" || !task.assignedUserId || task.assignedUserId === user.id;
  const canAct = canAssemble && assignmentAllows && ["READY", "IN_PROGRESS"].includes(task.status);
  const canReportProblem = canAct && (user.role === "OWNER" || user.canReportProblem);
  const problem = task.status === "PROBLEM";
  const skipped = task.status === "SKIPPED";
  const completed = task.status === "COMPLETED" || skipped;
  const returnPath = "/work/assemble?source=ORDER";
  const token = `${task.id}:${task.version}:${task.status}:${requestId}`;
  const hidden = (suffix: string) => <><input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="expectedStatus" value={task.status}/><input type="hidden" name="clientRequestId" value={`${token}:${suffix}`}/><input type="hidden" name="returnPath" value={returnPath}/></>;
  const openDetails = () => openOverlay({ id: `order-assembly-details:${task.id}`, kind: "DETAILS", surface: "drawer", title: "Assembly details", content: <OrderAssemblyDetails task={task} guidance={guidance} route={route.processRoute} workers={workers} user={user} returnPath={returnPath} token={token}/> });
  const openProblem = () => openOverlay({ id: `order-assembly-problem:${task.id}`, kind: "PROBLEM", surface: "dialog", title: problem ? "Open problem" : "Report problem", content: problem ? <OpenOrderAssemblyProblem task={task}/> : <ReportOrderAssemblyProblem task={task} returnPath={returnPath} token={token}/> });
  const openPartial = () => openOverlay({ id: `order-assembly-partial:${task.id}`, kind: "PARTIAL_QUANTITY", surface: "dialog", title: "Partial quantity", content: <OrderAssemblyPartialQuantity task={task} returnPath={returnPath} token={token}/> });

  return <WorkCard
    source="ORDER"
    stage="ASSEMBLE"
    status={task.status}
    context={<WorkCardContext source="Customer order" marketplace={task.account.marketplace} stage="ASSEMBLE" status={task.status}/>}
    media={<WorkImageGallery images={[order.imageUrl, guidance?.imageUrl]} alt={order.productDescription ?? order.sku} compact/>}
    identity={<WorkCardIdentity eyebrow={`Order item ${order.orderItemId ?? order.id}`} title={order.productDescription ?? "Untitled product"} sellerSku={order.sku} metadata={order.trackingId ? <>Tracking / AWB <span className="break-all font-medium text-slate-700">{order.trackingId}</span></> : <>AWB <span className="break-all font-medium text-slate-700">{order.awb}</span></>}/>} 
    processFlow={<WorkProcessFlow currentStage="ASSEMBLE" route={route.processRoute} fallback={route.source === "SYSTEM_FALLBACK"}/>} 
    quantity={<WorkCardQuantity stage="ASSEMBLE" label="Assembly quantity" required={task.requiredQuantity} completed={task.completedQuantity} itemCount={1} assignment={task.assignedUser ? `Assigned to ${task.assignedUser.name}` : "Unassigned"}/>} 
    state={<div className="grid gap-2">{problem ? <WorkCardState tone="danger" title="Work paused">An open problem must be resolved before Assembly can continue.</WorkCardState> : completed ? <WorkCardState tone="success" title={skipped ? "Assembly skipped" : "Assembly completed"}>This task is available as a read-only receipt.</WorkCardState> : !canAssemble || !assignmentAllows ? <WorkCardState title="Read-only Assembly view">Your permissions or assignment do not allow this Assembly action.</WorkCardState> : null}<AssemblyGuidance guidance={guidance} missing={!guidance}/></div>}
    actions={<WorkCardActions mode={problem ? "problem" : completed ? "completed" : canAct ? "ready" : "read-only"}>
      {canAct ? <form action={completeOrderAssemblyAction} className="col-span-2">{hidden("complete")}<SubmitButton pendingText="Completing..." className="w-full">Assembly Completed</SubmitButton></form> : null}
      {canAct && task.requiredQuantity - task.completedQuantity > 1 ? <button type="button" onClick={openPartial} className={buttonStyles({ variant: "secondary", className: "w-full" })}>Partial Quantity</button> : null}
      {canAct && task.status === "READY" && !task.assignedUserId ? <form action={claimOrderAssemblyAction}>{hidden("claim")}<SubmitButton pendingText="Starting..." variant="secondary" className="w-full">Start Assembly</SubmitButton></form> : null}
      {(problem || canReportProblem) ? <button type="button" onClick={openProblem} className={buttonStyles({ variant: "danger", className: "w-full" })}>{problem ? "Open Problem" : "Problem"}</button> : null}
      <button type="button" onClick={openDetails} className={buttonStyles({ variant: "secondary", className: "w-full" })}>Details</button>
    </WorkCardActions>}
  />;
}

function OrderAssemblyPartialQuantity({ task, returnPath, token }: { task: OrderAssemblyQueueTask; returnPath: string; token: string }) {
  return <form action={setOrderAssemblyProgressAction} className="grid gap-4">
    <div><p className="break-words font-semibold text-slate-950">{task.order?.productDescription ?? "Untitled product"}</p><p className="mt-1 break-all font-mono text-sm text-slate-700">Seller SKU {task.order?.sku}</p></div>
    <p className="text-sm tabular-nums text-slate-700">{task.requiredQuantity} required <span aria-hidden="true">&middot;</span> {task.completedQuantity} completed <span aria-hidden="true">&middot;</span> {task.requiredQuantity - task.completedQuantity} remaining</p>
    <input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="expectedStatus" value={task.status}/><input type="hidden" name="expectedQuantity" value={task.completedQuantity}/><input type="hidden" name="clientRequestId" value={`${token}:partial`}/><input type="hidden" name="returnPath" value={returnPath}/>
    <Field id={`order-assembly-target-${task.id}`} label="Exact completed quantity" required>{(attributes) => <input {...attributes} name="targetQuantity" type="number" min={task.completedQuantity + 1} max={task.requiredQuantity - 1} defaultValue={task.completedQuantity + 1} step="1" className={fieldControlStyles()}/>}</Field>
    <SubmitButton pendingText="Saving..." variant="secondary" className="w-full">Save partial quantity</SubmitButton>
  </form>;
}

function ReportOrderAssemblyProblem({ task, returnPath, token }: { task: OrderAssemblyQueueTask; returnPath: string; token: string }) {
  return <form action={reportOrderAssemblyProblemAction} className="grid gap-4"><p className="font-semibold text-slate-950">{task.order?.sku}</p><input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="expectedStatus" value={task.status}/><input type="hidden" name="clientRequestId" value={`${token}:problem`}/><input type="hidden" name="returnPath" value={returnPath}/><Field id={`order-assembly-reason-${task.id}`} label="Problem reason" required>{(attributes) => <select {...attributes} name="reason" className={fieldControlStyles()}>{ORDER_ASSEMBLY_PROBLEM_CATEGORIES.map((reason) => <option key={reason} value={reason}>{titleCase(reason)}</option>)}</select>}</Field><Field id={`order-assembly-note-${task.id}`} label="Note" help="Optional, up to 1,000 characters.">{(attributes) => <textarea {...attributes} name="note" maxLength={1000} className={fieldControlStyles({ className: "min-h-24" })}/>}</Field><SubmitButton pendingText="Reporting..." variant="danger" className="w-full">Report problem</SubmitButton></form>;
}

function OpenOrderAssemblyProblem({ task }: { task: OrderAssemblyQueueTask }) {
  const report = task.actionLogs.find((item) => item.action === "TASK_PROBLEM_REPORTED");
  return <div className="grid gap-3"><WorkCardState tone="danger" title={titleCase(task.problemReason ?? "Assembly problem")}>{report?.note ?? "This work remains paused until the problem is resolved."}</WorkCardState><p className="text-sm text-slate-600">Reported by {task.problemReportedBy?.name ?? "Unknown worker"}</p></div>;
}

function OrderAssemblyDetails({ task, guidance, route, workers, user, returnPath, token }: { task: OrderAssemblyQueueTask; guidance: ReturnType<typeof resolveAssemblyGuidance>; route: string; workers: Array<{ id: string; name: string }>; user: User; returnPath: string; token: string }) {
  const order = task.order!;
  return <div className="grid gap-5"><Detail title="Product"><div className="flex items-start gap-3"><WorkImageGallery images={[order.imageUrl]} alt={order.productDescription ?? order.sku} compact/><div className="min-w-0"><p className="break-words font-semibold">{order.productDescription ?? "Untitled product"}</p><p className="mt-1 break-all font-mono text-sm">Seller SKU {order.sku}</p></div></div></Detail>{guidance ? <Detail title="Assembly guidance"><AssemblyDetails guidance={guidance}/></Detail> : <WorkCardState tone="danger" title="Assembly instructions unavailable">No guidance has been invented.</WorkCardState>}<Detail title="Process flow"><WorkProcessFlow currentStage="ASSEMBLE" route={route}/></Detail><Detail title="Quantity and assignment"><p className="tabular-nums">{task.requiredQuantity} required <span aria-hidden="true">&middot;</span> {task.completedQuantity} completed <span aria-hidden="true">&middot;</span> {task.requiredQuantity - task.completedQuantity} remaining</p><p className="mt-1 text-sm text-slate-600">{task.assignedUser ? `Assigned to ${task.assignedUser.name}` : "Unassigned"}</p></Detail><Detail title="Identifiers"><dl className="grid gap-2 sm:grid-cols-2">{[["AWB", order.awb], ["Tracking", order.trackingId], ["Order", order.orderNo], ["Shipment", order.shipmentId], ["Order item", order.orderItemId]].filter((item): item is [string,string] => Boolean(item[1])).map(([label,value]) => <div key={label}><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="break-all text-sm font-medium">{value}</dd></div>)}</dl></Detail>{task.problemReason ? <Detail title="Problem"><OpenOrderAssemblyProblem task={task}/></Detail> : null}<Detail title="Recent stage history">{task.actionLogs.length ? <ol className="space-y-2">{task.actionLogs.map((item, index) => <li key={`${item.action}:${item.createdAt.toISOString()}:${index}`} className="text-sm"><span className="font-semibold">{titleCase(item.action)}</span> by {item.actorUser.name}<span className="block text-xs text-slate-500">{item.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span></li>)}</ol> : <p className="text-sm text-slate-600">No recorded Assembly actions yet.</p>}</Detail>{user.role === "OWNER" ? <OwnerControls task={task} workers={workers} returnPath={returnPath} token={token}/> : null}</div>;
}

function OwnerControls({ task, workers, returnPath, token }: { task: OrderAssemblyQueueTask; workers: Array<{ id: string; name: string }>; returnPath: string; token: string }) {
  const base = <><input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="returnPath" value={returnPath}/></>;
  return <Detail title="Owner controls"><div className="grid gap-4">{task.status === "PROBLEM" ? <form action={resolveOrderAssemblyProblemAction} className="grid gap-2">{base}<input type="hidden" name="clientRequestId" value={`${token}:resolve`}/><Field id={`order-assembly-resolution-${task.id}`} label="Resolution note" required>{(attributes) => <textarea {...attributes} name="resolutionNote" required maxLength={1000} className={fieldControlStyles({ className: "min-h-24" })}/>}</Field><SubmitButton pendingText="Resolving...">Resolve problem</SubmitButton></form> : null}<form action={reassignOrderAssemblyAction} className="grid gap-2">{base}<input type="hidden" name="clientRequestId" value={`${token}:assign`}/><Field id={`order-assembly-assignment-${task.id}`} label="Assigned worker">{(attributes) => <select {...attributes} name="assignedUserId" defaultValue={task.assignedUserId ?? ""} className={fieldControlStyles()}><option value="">Unassigned</option>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select>}</Field><SubmitButton pendingText="Assigning..." variant="secondary">Update assignment</SubmitButton></form>{!["COMPLETED", "SKIPPED"].includes(task.status) ? <form action={skipOrderAssemblyAction} className="grid gap-2">{base}<input type="hidden" name="clientRequestId" value={`${token}:skip`}/><Field id={`order-assembly-skip-${task.id}`} label="Skip reason" required>{(attributes) => <textarea {...attributes} name="reason" required maxLength={1000} className={fieldControlStyles({ className: "min-h-24" })}/>}</Field><SubmitButton pendingText="Skipping..." variant="danger">Skip Assembly</SubmitButton></form> : null}</div></Detail>;
}

function Detail({ title, children }: { title: string; children: ReactNode }) { return <section><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3><div className="mt-2">{children}</div></section>; }
function titleCase(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
