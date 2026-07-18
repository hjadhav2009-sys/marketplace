"use server";

import { redirect } from "next/navigation";
import { recordAuditLog } from "@/lib/audit";
import { capabilityHomePath, requireAccount, requireUser } from "@/lib/auth";
import { normalizeAwb } from "@/lib/awb";
import { searchOrdersByAwbFragment } from "@/lib/data";
import { buildWorkQueueOrderWhere } from "@/lib/operations/work-queue";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import { packCustomerOrderShipmentSafely } from "@/src/lib/workflow/order-pack-scope";
import { hasWorkPermission } from "@/lib/work-permissions";

function writeScanLogLater(input: {
  accountId: string;
  orderId?: string;
  awb: string;
  outcome: "FOUND" | "NOT_FOUND";
  scannedById: string;
  note: string;
}) {
  void prisma.scanLog.create({ data: input }).catch(() => undefined);
}

export async function searchAwbAction(formData: FormData) {
  const user = await requireUser();
  const account = await requireAccount(user);
  if (!hasWorkPermission(user, "canPack")) redirect(capabilityHomePath(user));
  const query = normalizeAwb(formData.get("awb"));

  if (query.length < 5) {
    redirect("/packing?error=invalid");
  }

  const matches = await searchOrdersByAwbFragment(account.id, query, 10);

  if (matches.length !== 1) {
    if (matches.length > 1) {
      const sameTrackingMatches = matches.filter((match) => match.trackingId && normalizeAwb(match.trackingId) === query);

      if (sameTrackingMatches.length === matches.length) {
        const firstMatch = sameTrackingMatches[0];

        if (firstMatch) {
          writeScanLogLater({
            accountId: account.id,
            orderId: firstMatch.id,
            awb: firstMatch.trackingId ?? firstMatch.awb,
            outcome: "FOUND",
            scannedById: user.id,
            note: `Tracking ID lookup "${query}" matched ${sameTrackingMatches.length} ready shipment item(s).`
          });
          redirect(`/packing/${encodeURIComponent(firstMatch.awb)}`);
        }
      }

      redirect(`/packing?q=${encodeURIComponent(query)}&multiple=1`);
    }

    writeScanLogLater({
      accountId: account.id,
      awb: query,
      outcome: "NOT_FOUND",
      scannedById: user.id,
      note: "AWB lookup did not match an order."
    });

    redirect(`/packing?notFound=${encodeURIComponent(query)}`);
  }

  const matchedOrder = matches[0];

  if (!matchedOrder) {
    redirect(`/packing?notFound=${encodeURIComponent(query)}`);
  }

  writeScanLogLater({
    accountId: account.id,
    orderId: matchedOrder.id,
    awb: matchedOrder.trackingId ?? matchedOrder.awb,
    outcome: "FOUND",
    scannedById: user.id,
    note:
      query === normalizeAwb(matchedOrder.trackingId ?? matchedOrder.awb)
        ? `${matchedOrder.trackingId ? "Tracking ID" : "AWB"} lookup matched an order.`
        : `Partial AWB lookup "${query}" matched an order.`
  });

  redirect(`/packing/${encodeURIComponent(matchedOrder.awb)}`);
}

export async function moveOldPendingToReviewAction() {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const oldPendingWhere = buildWorkQueueOrderWhere(account.id, { work: "old-pending" });
  const update = await prisma.order.updateMany({
    where: oldPendingWhere,
    data: {
      oldPendingReviewStatus: "IN_REVIEW",
      oldPendingReviewedAt: new Date(),
      oldPendingReviewNote: "Moved from packing dashboard for owner review."
    }
  });
  const oldPendingCount = update.count;

  await recordAuditLog({
    userId: user.id,
    accountId: account.id,
    action: "OLD_PENDING_REVIEW_CREATED",
    entityType: "Order",
    metadata: {
      oldPendingCount,
      mode: "review-queue"
    },
    request
  });

  redirect(`/owner/old-pending?moved=${oldPendingCount}`);
}

export async function directPackFromSearchAction(formData: FormData) {
  const user = await requireUser();
  const account = await requireAccount(user);
  if (!hasWorkPermission(user, "canPack")) redirect(capabilityHomePath(user));
  const orderId = String(formData.get("orderId") ?? "");
  const returnQuery = normalizeAwb(formData.get("returnQuery"));

  if (!orderId) {
    redirect("/packing?error=invalid");
  }

  let packedCount = 0;
  let packError: string | null = null;
  try {
    const result = await packCustomerOrderShipmentSafely({ actorUserId: user.id, accountId: account.id, orderId, source: "packing-search-card" });
    packedCount = result.packedCount;
  } catch (cause) {
    packError = cause instanceof Error ? cause.message : "Packing failed. Scan again.";
  }

  if (packError) {
    const params = new URLSearchParams({ scanError: packError, intent: "PACK" });
    if (returnQuery) params.set("q", returnQuery);
    redirect(`/packing?${params}`);
  }
  redirect(`/packing?directPacked=${packedCount || "already"}`);
}
