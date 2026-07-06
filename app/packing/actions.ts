"use server";

import { redirect } from "next/navigation";
import { recordAuditLog } from "@/lib/audit";
import { requireAccount, requireUser } from "@/lib/auth";
import { normalizeAwb } from "@/lib/awb";
import { searchOrdersByAwbFragment } from "@/lib/data";
import { buildConfirmPackedOrderWhere } from "@/lib/operations/packing";
import { buildWorkQueueOrderWhere } from "@/lib/operations/work-queue";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";

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
  const user = await requireUser(["OWNER", "PACKER"]);
  const account = await requireAccount(user);
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
  const oldPendingCount = await prisma.order.count({
    where: buildWorkQueueOrderWhere(account.id, { work: "old-pending" })
  });

  await recordAuditLog({
    userId: user.id,
    accountId: account.id,
    action: "OLD_PENDING_REVIEW_REPORTED",
    entityType: "Order",
    metadata: {
      oldPendingCount,
      mode: "filter-only"
    },
    request
  });

  redirect(`/packing?oldPendingReviewed=${oldPendingCount}`);
}

export async function directPackFromSearchAction(formData: FormData) {
  const user = await requireUser(["OWNER", "PACKER"]);
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const orderId = String(formData.get("orderId") ?? "");
  const returnQuery = normalizeAwb(formData.get("returnQuery"));

  if (!orderId) {
    redirect("/packing?error=invalid");
  }

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      accountId: account.id
    },
    select: {
      id: true,
      accountId: true,
      awb: true,
      marketplace: true,
      trackingId: true,
      packStatus: true
    }
  });

  if (!order) {
    redirect("/packing?error=invalid");
  }

  const packedCount = await prisma.$transaction(async (tx) => {
    const shipmentWhere = buildConfirmPackedOrderWhere(order, account.id);
    const shipmentOrders = await tx.order.findMany({
      where: shipmentWhere,
      select: {
        id: true,
        awb: true,
        trackingId: true
      }
    });

    if (shipmentOrders.length === 0) {
      return 0;
    }

    const update = await tx.order.updateMany({
      where: shipmentWhere,
      data: {
        status: "PACKED",
        packStatus: "PACKED",
        packedAt: new Date()
      }
    });

    if (update.count === 0) {
      return 0;
    }

    await tx.scanLog.createMany({
      data: shipmentOrders.map((shipmentOrder) => ({
        accountId: account.id,
        orderId: shipmentOrder.id,
        awb: shipmentOrder.trackingId ?? shipmentOrder.awb,
        outcome: "PACKED",
        scannedById: user.id,
        note: shipmentOrders.length > 1 ? "Direct pack confirmed Flipkart shipment from search." : "Direct pack confirmed order from search."
      }))
    });

    return update.count;
  });

  if (packedCount > 0) {
    await recordAuditLog({
      userId: user.id,
      accountId: account.id,
      action: "ORDER_PACKED",
      entityType: "Order",
      entityId: order.id,
      metadata: { awb: order.awb, trackingId: order.trackingId, packedCount, source: "packing-search-card" },
      request
    });
  }

  const searchParam = returnQuery ? `&q=${encodeURIComponent(returnQuery)}` : "";
  redirect(`/packing?directPacked=${packedCount || "already"}${searchParam}`);
}
