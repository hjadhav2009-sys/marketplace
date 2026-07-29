"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { WorkImageGallery } from "@/components/WorkImageGallery";
import { WorkRouteDialog } from "@/components/WorkRouteDialog";
import type { GroupedWorkCard as Card } from "@/src/lib/workflow/grouped-work";
import type { WorkChangeDetail } from "./LiveWorkRefresh";
import { completeGroupedStageAction } from "./stage-actions";

export function GroupedWorkCard({ card: initialCard, canAct }: { card: Card; canAct: boolean }) {
  const [card, setCard] = useState(initialCard);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    setCard(initialCard);
    setRemoved(false);
  }, [initialCard]);

  useEffect(() => {
    const changed = async (event: Event) => {
      const detail = (event as CustomEvent<WorkChangeDetail>).detail;
      if (detail.groupKey !== card.groupKey) return;
      if (detail.eventType === "STAGE_COMPLETED" && detail.stage === card.stage) {
        setRemoved(true);
        return;
      }
      try {
        const response = await fetch(`/api/work/groups/${card.stage.toLowerCase()}/${card.groupKey}?source=${card.sourceType}`, { cache: "no-store" });
        if (response.status === 404) {
          setRemoved(true);
          return;
        }
        if (response.ok) setCard(((await response.json()) as { card: Card }).card);
      } catch {
        // The live refresh stream will retry.
      }
    };
    window.addEventListener("work-change", changed);
    return () => window.removeEventListener("work-change", changed);
  }, [card.groupKey, card.sourceType, card.stage]);

  if (removed) return null;

  const details = `/work/groups/${card.stage.toLowerCase()}/${card.groupKey}?source=${card.sourceType}`;
  const token = `${card.groupKey}:${card.groupVersion}`;
  const isPackage = card.sourceType === "ORDER" && card.stage === "PACK";
  const identity = isPackage
    ? `Package ${card.trackingId ?? card.operationalIdentifier ?? card.reference}`
    : card.sourceType === "ORDER"
      ? `Order Item ${card.orderItemId ?? card.reference}`
      : `Consignment line ${card.consignmentLineId?.slice(-8) ?? card.reference}`;
  const routeLabel = card.hasExplicitSavedRoute ? card.savedProcessRoute ?? "Saved route" : "System fallback — Direct to Pack";
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-responsive-work-card data-source={card.sourceType} data-stage={card.stage} data-status={card.status}>
      <div className="p-3 sm:p-4">
        <div className="flex flex-wrap gap-1">
          <Badge dark>{card.sourceType === "ORDER" ? "CUSTOMER ORDER" : "CONSIGNMENT"}</Badge>
          <Badge>{card.marketplace}</Badge>
          <Badge>{card.stage}</Badge>
          <Badge>{card.status.replaceAll("_", " ")}</Badge>
        </div>
        <div className="mt-3 grid grid-cols-[6rem_minmax(0,1fr)] gap-3 sm:grid-cols-[7rem_minmax(0,1fr)] xl:grid-cols-[7rem_minmax(0,1fr)_15rem_15rem] xl:items-start">
          <WorkImageGallery images={[card.productImageUrl]} alt={card.productTitle ?? card.sellerSku} compact/>
          <div className="min-w-0">
          <p className="mt-3 text-xs font-bold uppercase tracking-wide text-berry">{identity}</p>
          <h2 className="mt-1 break-words text-lg font-black leading-tight sm:text-xl">{card.productTitle ?? "Untitled product"}</h2>
          <p className="mt-1 break-all font-mono text-sm font-bold">Seller SKU {card.sellerSku}</p>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <Item label="Current stage" value={card.stage}/>
            <Item label="Route" value={routeLabel}/>
            <Item label="Assignment" value={card.assignedUserName ?? "Unassigned"}/>
            {card.problemCount ? <Item label="Problem state" value={`${card.problemCount} ${card.problemCount === 1 ? "problem" : "problems"}`}/> : null}
          </dl>
          <details className="mt-1">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold text-berry">More identifiers</summary>
            <Identifiers card={card}/>
          </details>
          </div>
          <QuantityPanel card={card} isPackage={isPackage}/>
          <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-2 xl:col-span-1" data-work-actions>
            <CardActions card={card} canAct={canAct} details={details} token={token}/>
          </div>
        </div>
      </div>
    </article>
  );
}

function QuantityPanel({ card, isPackage }: { card: Card; isPackage: boolean }) {
  return <div className="col-span-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 xl:col-span-1" data-quantity-panel>
    {isPackage ? <>
      <p className="text-sm font-bold text-slate-500">Package quantity</p>
      <p className="mt-1 text-2xl font-black">{card.requiredQuantity}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <span><b>Order items</b><br/>{card.memberCount}</span>
        <span><b>Total units</b><br/>{card.requiredQuantity}</span>
      </div>
    </> : <>
      <div className="flex items-end justify-between gap-3">
        <div><p className="text-sm font-bold text-slate-500">Quantity to process</p><p className="text-2xl font-black">{card.requiredQuantity}</p></div>
        <div className="grid grid-cols-2 gap-3 text-right text-sm">
          <span><b>Completed</b><br/>{card.completedQuantity}</span>
          <span><b>Pending</b><br/>{card.pendingQuantity}</span>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label={`${card.stage} quantity completed`}
        aria-valuemin={0}
        aria-valuemax={card.requiredQuantity}
        aria-valuenow={card.completedQuantity}
        className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"
      >
        <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.min(100, card.requiredQuantity ? card.completedQuantity / card.requiredQuantity * 100 : 0)}%` }}/>
      </div>
    </>}
  </div>;
}

function CardActions({ card, canAct, details, token }: { card: Card; canAct: boolean; details: string; token: string }) {
  const problem = card.status === "PROBLEM" || card.problemCount > 0;
  const completed = card.status === "COMPLETED";
  const hidden = <>
    <input type="hidden" name="stage" value={card.stage}/>
    <input type="hidden" name="sourceType" value={card.sourceType}/>
    <input type="hidden" name="groupKey" value={card.groupKey}/>
    <input type="hidden" name="groupVersion" value={card.groupVersion}/>
    <input type="hidden" name="clientRequestId" value={`${token}:complete`}/>
  </>;

  if (problem) {
    return <div className="grid grid-cols-2 gap-2" data-action-mode="problem">
      <p className="col-span-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">
        Work paused — an open problem must be resolved before processing can continue.
      </p>
      <Link href={`${details}#problems`} className="flex min-h-11 items-center justify-center rounded-xl bg-amber-700 px-3 text-center font-bold text-white">Open Problem</Link>
      <Details href={details}/>
    </div>;
  }

  if (completed) {
    return <div className="grid grid-cols-2 gap-2" data-action-mode="completed">
      <p className="col-span-2 rounded-xl bg-white p-3 text-sm font-bold text-slate-600">This work is completed and is available as a read-only receipt.</p>
      <Details href={details}/>
    </div>;
  }

  if (!canAct) {
    return <div className="grid grid-cols-2 gap-2" data-action-mode="read-only">
      <p className="col-span-2 rounded-xl bg-white p-3 text-sm font-bold text-slate-600">
        Read-only: your current permissions do not allow {card.stage.toLowerCase()} actions.
      </p>
      <Details href={details}/>
    </div>;
  }

  if (card.stage === "PACK") {
    return <div className="grid grid-cols-2 gap-2" data-action-mode="ready">
      <form action={completeGroupedStageAction}>{hidden}<SubmitButton pendingText="Packing...">Complete Pack</SubmitButton></form>
      <Details href={details}/>
      <Link href={`${details}#problems`} className="col-span-2 flex min-h-11 items-center justify-center rounded-xl border border-rose-300 bg-white font-bold text-rose-700">Problem</Link>
    </div>;
  }

  const completionLabel = card.stage === "PICK" ? "Complete Pick" : card.stage === "MARK" ? "Marking Completed" : "Assembly Completed";
  return <div className="grid grid-cols-2 gap-2" data-action-mode="ready">
    <WorkRouteDialog
      card={{
        stage: card.stage,
        sourceType: card.sourceType,
        groupKey: card.groupKey,
        groupVersion: card.groupVersion,
        taskId: card.memberTaskIds[0],
        completedQuantity: card.completedQuantity,
        hasExplicitSavedRoute: card.hasExplicitSavedRoute,
        savedProcessRoute: card.savedProcessRoute,
        missingInstructionStages: card.missingInstructionStages
      }}
      triggerLabel={completionLabel}
    />
    <Link href={`${details}#quantity`} className="flex min-h-11 items-center justify-center rounded-xl border bg-white px-2 text-center font-bold">Partial Quantity</Link>
    <Link href={`${details}#problems`} className="flex min-h-11 items-center justify-center rounded-xl border border-rose-300 bg-white font-bold text-rose-700">Problem</Link>
    <Details href={details}/>
  </div>;
}

function Identifiers({ card }: { card: Card }) {
  return <dl className="grid gap-2 text-sm sm:grid-cols-2">
    {card.orderItemId ? <Item label="Order Item ID" value={card.orderItemId}/> : null}
    {card.orderNumber ? <Item label="Order ID" value={card.orderNumber}/> : null}
    {card.shipmentId ? <Item label="Shipment ID" value={card.shipmentId}/> : null}
    {card.trackingId ? <Item label="Tracking ID" value={card.trackingId}/> : null}
    {card.consignmentNumber ? <Item label="Consignment" value={card.consignmentNumber}/> : null}
  </dl>;
}

function Badge({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${dark ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>{children}</span>;
}

function Item({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs font-bold text-slate-500">{label}</dt><dd className="break-all font-semibold">{value}</dd></div>;
}

function Details({ href }: { href: string }) {
  return <Link href={href} className="flex min-h-11 items-center justify-center rounded-xl border bg-white px-3 text-center font-bold">Details</Link>;
}
