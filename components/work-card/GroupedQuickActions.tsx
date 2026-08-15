"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { WorkStage } from "@prisma/client";
import { reportGroupedProblemAction, setGroupedProgressAction } from "@/app/work/stage-actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Field, fieldControlStyles } from "@/components/ui/Field";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { ProductImage } from "@/components/ProductImage";
import { useWorkerOverlay } from "@/components/worker-overlay/WorkerOverlay";
import { humanProcessRoute } from "./WorkProcessFlow";

const PROBLEM_REASONS = ["PRODUCT_NOT_FOUND", "WRONG_PRODUCT", "QUANTITY_SHORT", "DAMAGED_PRODUCT", "MARKING_FILE_MISSING", "MARKING_FILE_WRONG", "MARKING_FAILED", "PACKING_BLOCKED", "IDENTIFIER_NOT_MATCHING", "OTHER"];

export type GroupedQuickCard = {
  groupKey: string; groupVersion: string; sourceType: "ORDER" | "CONSIGNMENT"; stage: WorkStage; status: string;
  productTitle: string | null; sellerSku: string; marketplace: string; productImageUrl: string | null;
  savedProcessRoute: string | null; hasExplicitSavedRoute: boolean; requiredQuantity: number; completedQuantity: number; pendingQuantity: number;
  assignedUserName: string | null; memberCount: number; problemCount: number; missingInstructionStages: WorkStage[];
  orderItemId: string | null; orderNumber: string | null; shipmentId: string | null; trackingId: string | null; consignmentNumber: string | null;
};

type QuickTask = { taskId: string; orderId: string | null; version: number; status: string; requiredQuantity: number; completedQuantity: number; assignment: string; reference: string; problemReason: string | null; problemReporter: string | null; problemReportedAt: string | null };
type QuickDetails = { groupVersion: string; tasks: QuickTask[]; history: Array<{ id: string; action: string; actor: string; createdAt: string; quantityAfter: number | null }>; instructions: string[] };

export function GroupedQuickActions({ card, detailsHref, canAct, canReportProblem }: { card: GroupedQuickCard; detailsHref: string; canAct: boolean; canReportProblem: boolean }) {
  const { openOverlay } = useWorkerOverlay();
  const problem = card.status === "PROBLEM" || card.problemCount > 0;
  const openDetails = () => openOverlay({ id: `details:${card.groupKey}`, kind: "DETAILS", surface: "drawer", title: "Work details", content: <GroupedDetails card={card} detailsHref={detailsHref} /> });
  const openProblem = () => openOverlay({ id: `problem:${card.groupKey}`, kind: "PROBLEM", surface: "dialog", title: problem ? "Open problem" : "Report problem", content: <GroupedProblem card={card} detailsHref={detailsHref} readOnly={problem || !canReportProblem} /> });
  const openPartial = () => openOverlay({ id: `partial:${card.groupKey}`, kind: "PARTIAL_QUANTITY", surface: "dialog", title: "Partial quantity", content: <GroupedPartialQuantity card={card} /> });
  return <>
    {canAct && card.stage !== "PACK" && card.pendingQuantity > 1 ? <button type="button" onClick={openPartial} className={buttonStyles({ variant: "secondary", className: "w-full" })}>Partial Quantity</button> : null}
    {(problem || canReportProblem) ? <button type="button" onClick={openProblem} className={buttonStyles({ variant: "danger", className: "w-full" })}>{problem ? "Open Problem" : "Problem"}</button> : null}
    <button type="button" onClick={openDetails} className={buttonStyles({ variant: "secondary", className: "w-full" })}>Details</button>
  </>;
}

function GroupedPartialQuantity({ card }: { card: GroupedQuickCard }) {
  const requestId = useId();
  const max = card.requiredQuantity - 1;
  return <form action={setGroupedProgressAction} className="grid gap-4">
    <ProductSummary card={card}/><p className="text-sm tabular-nums text-slate-700">{card.requiredQuantity} required · {card.completedQuantity} completed · {card.pendingQuantity} remaining</p>
    <input type="hidden" name="stage" value={card.stage}/><input type="hidden" name="sourceType" value={card.sourceType}/><input type="hidden" name="groupKey" value={card.groupKey}/><input type="hidden" name="groupVersion" value={card.groupVersion}/><input type="hidden" name="clientRequestId" value={`${card.groupKey}:${card.groupVersion}:${requestId}`}/><input type="hidden" name="returnPath" value={`/work/${card.stage.toLowerCase()}?source=${card.sourceType}`}/>
    <Field id={`group-target-${card.groupKey}`} label="Exact completed quantity" required>{(attributes) => <input {...attributes} name="targetQuantity" type="number" min={card.completedQuantity + 1} max={max} defaultValue={card.completedQuantity + 1} step="1" className={fieldControlStyles()} />}</Field>
    <SubmitButton pendingText="Saving..." variant="secondary" className="w-full">Save partial quantity</SubmitButton>
  </form>;
}

function GroupedDetails({ card, detailsHref }: { card: GroupedQuickCard; detailsHref: string }) {
  const { data, loading, error } = useQuickDetails(card);
  return <div className="grid gap-5">
    <DetailSection title="Product"><div className="flex items-start gap-3"><ProductImage src={card.productImageUrl} alt={card.productTitle ?? card.sellerSku} size="md" showBadge={false}/><div className="min-w-0"><ProductSummary card={card}/><p className="mt-2 text-sm text-slate-600">{card.sourceType === "ORDER" ? "Customer order" : "Consignment"} · {card.marketplace}</p></div></div></DetailSection>
    <DetailSection title="Process flow"><p className="font-semibold">{humanProcessRoute(card.savedProcessRoute)}</p><p className="mt-1 text-sm text-slate-600">Current stage: {titleCase(card.stage)}</p></DetailSection>
    <DetailSection title="Quantity"><p className="tabular-nums">{card.requiredQuantity} required · {card.completedQuantity} completed · {card.pendingQuantity} remaining</p><p className="mt-1 text-sm text-slate-600">{card.assignedUserName ? `Assigned to ${card.assignedUserName}` : "Unassigned"}</p></DetailSection>
    <DetailSection title="Identifiers"><dl className="grid gap-2">{identifiers(card).map((item) => <div key={item.label}><dt className="text-xs font-semibold text-slate-500">{item.label}</dt><dd className="break-all text-sm font-medium">{item.value}</dd></div>)}</dl></DetailSection>
    {loading ? <p role="status" className="text-sm text-slate-600">Loading current details…</p> : null}
    {error ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">Current quick details could not be loaded. Open full details for the complete record.</p> : null}
    {data?.instructions.length ? <DetailSection title="Instructions"><div className="space-y-1 text-sm">{data.instructions.map((line) => <p key={line} className="whitespace-pre-wrap">{line}</p>)}</div></DetailSection> : data && card.missingInstructionStages.length ? <DetailSection title="Instructions"><p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Saved instructions are unavailable for {card.missingInstructionStages.map(titleCase).join(" and ")}. No settings will be invented.</p></DetailSection> : null}
    {data?.tasks.some((task) => task.problemReason) ? <DetailSection title="Problem">{data.tasks.filter((task) => task.problemReason).map((task) => <p key={task.taskId} className="text-sm font-semibold text-rose-800">{titleCase(task.problemReason!)} · {task.reference}</p>)}</DetailSection> : null}
    {data?.history.length ? <DetailSection title="Recent history"><ol className="space-y-2">{data.history.map((item) => <li key={item.id} className="text-sm"><span className="font-semibold">{titleCase(item.action)}</span> by {item.actor}<span className="block text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</span></li>)}</ol></DetailSection> : null}
    <FullDetailsLink href={detailsHref}/>
  </div>;
}

function GroupedProblem({ card, detailsHref, readOnly }: { card: GroupedQuickCard; detailsHref: string; readOnly: boolean }) {
  const { data, loading, error } = useQuickDetails(card);
  const actionable = data?.tasks.filter((task) => !["COMPLETED", "PROBLEM"].includes(task.status)) ?? [];
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const selected = actionable.find((task) => task.taskId === selectedTaskId) ?? (actionable.length === 1 ? actionable[0] : null);
  const requestId = useId();
  if (loading) return <p role="status" className="text-sm text-slate-600">Loading exact work members…</p>;
  if (error || !data) return <div className="grid gap-3"><p className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">Exact member details are unavailable. No problem action is enabled.</p><FullDetailsLink href={detailsHref}/></div>;
  if (readOnly) return <div className="grid gap-4"><ProductSummary card={card}/><div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-950"><p className="font-semibold">Work paused</p>{data.tasks.filter((task) => task.problemReason).map((task) => <div key={task.taskId} className="mt-2 text-sm"><p>{titleCase(task.problemReason!)} · {task.reference} · {task.completedQuantity}/{task.requiredQuantity}</p><p className="mt-1 text-xs">Reported by {task.problemReporter ?? "Unknown worker"}{task.problemReportedAt ? ` · ${new Date(task.problemReportedAt).toLocaleString()}` : ""} · {task.assignment}</p></div>)}</div><FullDetailsLink href={detailsHref}/></div>;
  return <form action={reportGroupedProblemAction} className="grid gap-4">
    <ProductSummary card={card}/><p className="text-sm font-medium text-slate-700">Current stage: {titleCase(card.stage)}</p>
    {actionable.length > 1 ? <Field id={`problem-member-${card.groupKey}`} label="Affected work item" required>{(attributes) => <select {...attributes} value={selectedTaskId} onChange={(event) => setSelectedTaskId(event.currentTarget.value)} className={fieldControlStyles()}><option value="">Choose the exact item</option>{actionable.map((task) => <option key={task.taskId} value={task.taskId}>{task.reference} · {task.completedQuantity}/{task.requiredQuantity}</option>)}</select>}</Field> : null}
    <input type="hidden" name="sourceType" value={card.sourceType}/><input type="hidden" name="stage" value={card.stage}/><input type="hidden" name="taskId" value={selected?.taskId ?? ""}/><input type="hidden" name="orderId" value={selected?.orderId ?? ""}/><input type="hidden" name="expectedQuantity" value={selected?.completedQuantity ?? ""}/><input type="hidden" name="expectedTaskVersion" value={selected?.version ?? ""}/><input type="hidden" name="expectedTaskStatus" value={selected?.status ?? ""}/><input type="hidden" name="clientRequestId" value={`${card.groupKey}:${card.groupVersion}:${requestId}`}/>
    <Field id={`group-problem-reason-${card.groupKey}`} label="Problem reason" required>{(attributes) => <select {...attributes} name="reason" required className={fieldControlStyles()}>{PROBLEM_REASONS.map((reason) => <option key={reason} value={reason}>{titleCase(reason)}</option>)}</select>}</Field>
    <Field id={`group-problem-note-${card.groupKey}`} label="Note" help="Optional, up to 1,000 characters.">{(attributes) => <textarea {...attributes} name="note" maxLength={1000} className={fieldControlStyles({ className: "min-h-24" })} />}</Field>
    <SubmitButton pendingText="Reporting..." variant="danger" className="w-full" disabled={!selected}>Report problem</SubmitButton>
  </form>;
}

function useQuickDetails(card: GroupedQuickCard) {
  const [state, setState] = useState<{ data: QuickDetails | null; loading: boolean; error: boolean }>({ data: null, loading: true, error: false });
  useEffect(() => { const controller = new AbortController(); setState({ data: null, loading: true, error: false }); fetch(`/api/work/groups/${card.stage.toLowerCase()}/${encodeURIComponent(card.groupKey)}?source=${card.sourceType}&quick=1`, { cache: "no-store", signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error("Quick details unavailable"); return response.json() as Promise<{ quick: QuickDetails }>; }).then((value) => setState({ data: value.quick, loading: false, error: false })).catch((cause) => { if ((cause as Error).name !== "AbortError") setState({ data: null, loading: false, error: true }); }); return () => controller.abort(); }, [card.groupKey, card.sourceType, card.stage]);
  return state;
}

function identifiers(card: GroupedQuickCard) { return [{ label: "Order Item ID", value: card.orderItemId }, { label: "Order ID", value: card.orderNumber }, { label: "Shipment", value: card.shipmentId }, { label: "Tracking / AWB", value: card.trackingId }, { label: "Consignment", value: card.consignmentNumber }].filter((item): item is { label: string; value: string } => Boolean(item.value)); }
function ProductSummary({ card }: { card: GroupedQuickCard }) { return <div><p className="break-words font-semibold text-slate-950">{card.productTitle ?? "Untitled product"}</p><p className="mt-1 break-all font-mono text-sm text-slate-700">Seller SKU {card.sellerSku}</p></div>; }
function DetailSection({ title, children }: { title: string; children: React.ReactNode }) { return <section><h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3><div className="mt-2">{children}</div></section>; }
function FullDetailsLink({ href }: { href: string }) { const { closeOverlay } = useWorkerOverlay(); return <Link href={href} onClick={() => closeOverlay({ preserveHistory: true, returnFocus: false })} className={buttonStyles({ variant: "secondary", className: "w-full" })}>Open full details</Link>; }
function titleCase(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
