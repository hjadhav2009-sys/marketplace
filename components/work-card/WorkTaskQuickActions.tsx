"use client";

import Link from "next/link";
import type { WorkStage } from "@prisma/client";
import { reportTaskProblemAction, setTaskProgressAction } from "@/app/work/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Field, fieldControlStyles } from "@/components/ui/Field";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { ProductImage } from "@/components/ProductImage";
import { useWorkerOverlay } from "@/components/worker-overlay/WorkerOverlay";
import { humanProcessRoute } from "./WorkProcessFlow";

const PROBLEM_REASONS = ["PRODUCT_NOT_FOUND", "WRONG_PRODUCT", "QUANTITY_SHORT", "DAMAGED_PRODUCT", "MARKING_FILE_MISSING", "MARKING_FILE_WRONG", "MARKING_FAILED", "PACKING_BLOCKED", "IDENTIFIER_NOT_MATCHING", "OTHER"];

export type WorkTaskQuickModel = {
  taskId: string; stage: WorkStage; status: string; returnPath: string; fullDetailsHref: string;
  requestBase: string;
  title: string; sellerSku: string; imageUrl: string | null; source: string; marketplace: string; reference: string;
  route: string | null; required: number; completed: number; assignment: string;
  identifiers: Array<{ label: string; value: string }>;
  instructions: string[]; missingInstructionStages: WorkStage[]; priorStages: Array<{ stage: string; status: string }>;
  problem?: { reason: string; reporter: string; reportedAt: string | null; note: string | null };
};

export function WorkTaskQuickActions({ model, canProgress, canReportProblem }: { model: WorkTaskQuickModel; canProgress: boolean; canReportProblem: boolean }) {
  const { openOverlay } = useWorkerOverlay();
  const partial = () => openOverlay({ id: `partial:${model.taskId}`, kind: "PARTIAL_QUANTITY", surface: "dialog", title: "Partial quantity", content: <TaskPartialQuantity model={model} /> });
  const problem = () => openOverlay({ id: `problem:${model.taskId}`, kind: "PROBLEM", surface: "dialog", title: model.problem ? "Open problem" : "Report problem", content: model.problem ? <OpenTaskProblem model={model} /> : <TaskProblemForm model={model} /> });
  const details = () => openOverlay({ id: `details:${model.taskId}`, kind: "DETAILS", surface: "drawer", title: "Work details", content: <TaskDetails model={model} /> });
  return <>
    {canProgress && model.stage !== "PACK" && model.required - model.completed > 1 ? <button type="button" onClick={partial} className={buttonStyles({ variant: "secondary", className: "w-full" })}>Partial Quantity</button> : null}
    {(canReportProblem || model.problem) ? <button type="button" onClick={problem} className={buttonStyles({ variant: "danger", className: "w-full" })}>{model.problem ? "Open Problem" : "Problem"}</button> : null}
    <button type="button" onClick={details} className={buttonStyles({ variant: "secondary", className: "w-full" })}>Details</button>
  </>;
}

function TaskPartialQuantity({ model }: { model: WorkTaskQuickModel }) {
  return <form action={setTaskProgressAction} className="grid gap-4">
    <ProductSummary model={model}/>
    <p className="text-sm tabular-nums text-slate-700">{model.required} required · {model.completed} completed · {model.required - model.completed} remaining</p>
    <input type="hidden" name="taskId" value={model.taskId}/><input type="hidden" name="expectedQuantity" value={model.completed}/><input type="hidden" name="clientRequestId" value={`${model.requestBase}:partial`}/><input type="hidden" name="returnPath" value={model.returnPath}/>
    <Field id={`task-target-${model.taskId}`} label="Exact completed quantity" required>{(attributes) => <input {...attributes} name="targetQuantity" type="number" min={model.completed + 1} max={model.required - 1} step="1" defaultValue={model.completed + 1} className={fieldControlStyles()} />}</Field>
    <SubmitButton pendingText="Saving..." variant="secondary" className="w-full">Save exact quantity</SubmitButton>
  </form>;
}

function TaskProblemForm({ model }: { model: WorkTaskQuickModel }) {
  return <form action={reportTaskProblemAction} className="grid gap-4">
    <ProductSummary model={model}/><p className="text-sm font-medium text-slate-700">Current stage: {titleCase(model.stage)}</p>
    <input type="hidden" name="taskId" value={model.taskId}/><input type="hidden" name="expectedQuantity" value={model.completed}/><input type="hidden" name="clientRequestId" value={`${model.requestBase}:problem`}/><input type="hidden" name="returnPath" value={model.returnPath}/>
    <Field id={`problem-reason-${model.taskId}`} label="Problem reason" required>{(attributes) => <select {...attributes} name="reason" required className={fieldControlStyles()}>{PROBLEM_REASONS.map((reason) => <option key={reason} value={reason}>{titleCase(reason)}</option>)}</select>}</Field>
    <Field id={`problem-note-${model.taskId}`} label="Note" help="Optional, up to 1,000 characters.">{(attributes) => <textarea {...attributes} name="note" maxLength={1000} className={fieldControlStyles({ className: "min-h-24" })} />}</Field>
    <SubmitButton pendingText="Reporting..." variant="danger" className="w-full">Report problem</SubmitButton>
  </form>;
}

function OpenTaskProblem({ model }: { model: WorkTaskQuickModel }) {
  const problem = model.problem!;
  return <div className="grid gap-4"><ProductSummary model={model}/><div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-950"><p className="font-semibold">Work paused · {titleCase(problem.reason)}</p>{problem.note ? <p className="mt-1 whitespace-pre-wrap text-sm">{problem.note}</p> : null}<p className="mt-2 text-xs">{problem.reporter}{problem.reportedAt ? ` · ${problem.reportedAt}` : ""}</p></div><p className="text-sm tabular-nums">Progress {model.completed} of {model.required} · {model.assignment}</p><FullDetailsLink model={model}/></div>;
}

function TaskDetails({ model }: { model: WorkTaskQuickModel }) {
  return <div className="grid gap-5">
    <DetailSection title="Product"><div className="flex items-start gap-3"><ProductImage src={model.imageUrl} alt={model.title} size="md" showBadge={false}/><div className="min-w-0"><ProductSummary model={model}/><p className="mt-2 text-sm text-slate-600">{model.source} · {model.marketplace}</p></div></div></DetailSection>
    <DetailSection title="Process flow"><p className="font-semibold">{humanProcessRoute(model.route)}</p><p className="mt-1 text-sm text-slate-600">Current stage: {titleCase(model.stage)}</p></DetailSection>
    <DetailSection title="Quantity"><p className="tabular-nums">{model.required} required · {model.completed} completed · {model.required - model.completed} remaining</p><p className="mt-1 text-sm text-slate-600">{model.assignment}</p></DetailSection>
    <DetailSection title="Identifiers"><dl className="grid gap-2">{model.identifiers.map((item) => <div key={item.label}><dt className="text-xs font-semibold text-slate-500">{item.label}</dt><dd className="break-all text-sm font-medium">{item.value}</dd></div>)}</dl></DetailSection>
    {model.instructions.length ? <DetailSection title="Instructions"><div className="space-y-1 text-sm">{model.instructions.map((line) => <p key={line} className="whitespace-pre-wrap">{line}</p>)}</div></DetailSection> : null}
    {model.missingInstructionStages.length ? <DetailSection title="Missing required instructions"><p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Saved instructions are unavailable for {model.missingInstructionStages.map(titleCase).join(" and ")}. No settings will be invented.</p></DetailSection> : null}
    <DetailSection title="Recent stage history"><ol className="space-y-2">{model.priorStages.map((item) => <li key={`${item.stage}:${item.status}`} className="text-sm"><span className="font-semibold">{titleCase(item.stage)}</span> · {titleCase(item.status)}</li>)}</ol></DetailSection>
    {model.problem ? <DetailSection title="Problem"><p className="text-sm font-semibold text-rose-800">{titleCase(model.problem.reason)}</p></DetailSection> : null}
    <FullDetailsLink model={model}/>
  </div>;
}

function ProductSummary({ model }: { model: WorkTaskQuickModel }) { return <div><p className="break-words font-semibold text-slate-950">{model.title}</p><p className="mt-1 break-all font-mono text-sm text-slate-700">Seller SKU {model.sellerSku}</p><p className="mt-1 break-all text-xs text-slate-500">{model.reference}</p></div>; }
function DetailSection({ title, children }: { title: string; children: React.ReactNode }) { return <section><h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3><div className="mt-2">{children}</div></section>; }
function FullDetailsLink({ model }: { model: WorkTaskQuickModel }) { const { closeOverlay } = useWorkerOverlay(); return <Link href={model.fullDetailsHref} onClick={() => closeOverlay({ preserveHistory: true, returnFocus: false })} className={buttonStyles({ variant: "secondary", className: "w-full" })}>Open full details</Link>; }
function titleCase(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
