"use client";

import { useEffect, useState } from "react";
import { completeGroupedStageAction } from "@/app/work/stage-actions";
import { SubmitButton } from "@/components/SubmitButton";
import { WorkImageGallery } from "@/components/WorkImageGallery";
import {
  WorkCard,
  WorkCardActions,
  WorkCardContext,
  WorkCardIdentity,
  WorkCardQuantity,
  WorkCardState,
  WorkProcessFlow,
} from "@/components/work-card";
import { GroupedQuickActions } from "@/components/work-card/GroupedQuickActions";
import { PackReadiness } from "@/components/work-card/PackReadiness";
import type { GroupedWorkCard as Card } from "@/src/lib/workflow/grouped-work";
import type { WorkChangeDetail } from "../LiveWorkRefresh";
import { workChangeMatchesCard } from "../work-change-card-match";

export function PackWorkCard({ card: initialCard, canAct, canReportProblem }: { card: Card; canAct: boolean; canReportProblem: boolean }) {
  const [card, setCard] = useState(initialCard);
  const [removed, setRemoved] = useState(false);
  const { groupKey, memberTaskIds, sourceType } = card;

  useEffect(() => {
    setCard(initialCard);
    setRemoved(false);
  }, [initialCard]);

  useEffect(() => {
    const changed = async (event: Event) => {
      const detail = (event as CustomEvent<WorkChangeDetail>).detail;
      if (!workChangeMatchesCard({ groupKey, memberTaskIds }, detail)) return;
      if (detail.eventType === "STAGE_COMPLETED" && detail.stage === "PACK") {
        setRemoved(true);
        return;
      }
      try {
        const response = await fetch(`/api/work/groups/pack/${encodeURIComponent(groupKey)}?source=${sourceType}`, { cache: "no-store" });
        if (response.status === 404) setRemoved(true);
        else if (response.ok) setCard(((await response.json()) as { card: Card }).card);
      } catch {
        // The live refresh stream retries; retain the last safe card meanwhile.
      }
    };
    window.addEventListener("work-change", changed);
    return () => window.removeEventListener("work-change", changed);
  }, [groupKey, memberTaskIds, sourceType]);

  if (removed) return null;

  const isOrderPackage = card.sourceType === "ORDER";
  const packageReference = card.trackingId ?? card.operationalIdentifier ?? card.reference;
  const detailsHref = `/work/groups/pack/${card.groupKey}?source=${card.sourceType}`;
  const problem = card.status === "PROBLEM" || card.problemCount > 0;
  const blocked = !card.packReadiness?.packReady;
  const assignmentConflict = Boolean(card.assignmentConflict);
  const actionable = canAct && !problem && !blocked && !assignmentConflict && card.status !== "COMPLETED";
  const assignment = assignmentConflict
    ? `Mixed assignments: ${card.assignedUserNames?.join(", ") || "multiple workers"}`
    : card.assignedUserName ? `Assigned to ${card.assignedUserName}` : "Unassigned";

  return (
    <WorkCard
      source={card.sourceType}
      stage="PACK"
      status={card.status}
      context={<WorkCardContext source={isOrderPackage ? "Customer order package" : "Consignment line"} marketplace={card.marketplace} stage="PACK" status={card.status} />}
      media={<WorkImageGallery images={[card.productImageUrl]} alt={isOrderPackage ? `Package ${packageReference}` : card.productTitle ?? card.sellerSku} compact />}
      identity={isOrderPackage ? (
        <WorkCardIdentity
          eyebrow="Package reference"
          title={packageReference}
          sellerSku={card.memberCount === 1 ? card.sellerSku : `${card.memberCount} order items`}
          sellerSkuLabel={card.memberCount === 1 ? "Seller SKU" : "Contents"}
          description={card.memberCount > 1 ? "One physical package. Every item and required route must be ready before completion." : card.productTitle ?? "Customer order item"}
          metadata={card.orderNumber ? <>Order <span className="break-all font-medium text-slate-700">{card.orderNumber}</span></> : null}
        />
      ) : (
        <WorkCardIdentity
          eyebrow={`Consignment line ${card.consignmentLineId?.slice(-8) ?? card.reference}`}
          title={card.productTitle ?? "Untitled product"}
          sellerSku={card.sellerSku}
          metadata={card.consignmentNumber ? <>Consignment <span className="break-all font-medium text-slate-700">{card.consignmentNumber}</span></> : null}
        />
      )}
      processFlow={card.packReadiness ? <PackReadiness model={card.packReadiness} title={isOrderPackage ? "Package readiness" : "Line readiness"} /> : isOrderPackage ? null : <WorkProcessFlow route={card.processRoute} currentStage="PACK" fallback={card.processRouteDegraded} />}
      quantity={<WorkCardQuantity stage="PACK" required={card.requiredQuantity} completed={card.completedQuantity} itemCount={card.memberCount} mode={isOrderPackage ? "package" : "standard"} assignment={assignment} />}
      state={<PackState card={card} canAct={canAct} />}
      actions={<PackActions card={card} actionable={actionable} canReportProblem={canReportProblem} detailsHref={detailsHref} />}
    />
  );
}

function PackState({ card, canAct }: { card: Card; canAct: boolean }) {
  if (card.status === "PROBLEM" || card.problemCount > 0) return <WorkCardState tone="danger" title="Packing paused">Resolve the open problem before completing this package.</WorkCardState>;
  if (card.assignmentConflict) return <WorkCardState tone="warning" title="Packing assignment conflict">This package contains work assigned to different workers. No Pack action is available until ownership is resolved.</WorkCardState>;
  if (!card.packReadiness) return <WorkCardState tone="danger" title="Readiness unavailable">Packing stays disabled because authoritative prerequisite state could not be resolved.</WorkCardState>;
  if (!card.packReadiness.packReady) return <WorkCardState tone="warning" title="Not ready to pack">{card.packReadiness.blocker ?? "Complete the required upstream work before packing."}</WorkCardState>;
  if (!canAct) return <WorkCardState title="Read-only Pack view">Your current permissions do not allow Pack actions.</WorkCardState>;
  return <WorkCardState tone="success" title="Ready to pack">Verify the package reference, items, and readiness before completing Pack.</WorkCardState>;
}

function PackActions({ card, actionable, canReportProblem, detailsHref }: { card: Card; actionable: boolean; canReportProblem: boolean; detailsHref: string }) {
  const mode = card.status === "PROBLEM" || card.problemCount > 0 ? "problem" : actionable ? "ready" : "read-only";
  return <WorkCardActions mode={mode}>
    {actionable ? <form action={completeGroupedStageAction}>
      <input type="hidden" name="stage" value="PACK" />
      <input type="hidden" name="sourceType" value={card.sourceType} />
      <input type="hidden" name="groupKey" value={card.groupKey} />
      <input type="hidden" name="groupVersion" value={card.groupVersion} />
      <input type="hidden" name="clientRequestId" value={`${card.groupKey}:${card.groupVersion}:pack`} />
      <SubmitButton pendingText="Packing..." className="w-full">Pack Completed</SubmitButton>
    </form> : null}
    <GroupedQuickActions card={card} detailsHref={detailsHref} canAct={actionable} canReportProblem={canReportProblem} />
  </WorkCardActions>;
}
