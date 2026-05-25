"use server";

import { redirect } from "next/navigation";
import { recordAuditLog } from "@/lib/audit";
import { requireAccount, requireUser } from "@/lib/auth";
import { normalizeAwb } from "@/lib/awb";
import { searchOrdersByAwbFragment } from "@/lib/data";
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
    awb: matchedOrder.awb,
    outcome: "FOUND",
    scannedById: user.id,
    note: query === matchedOrder.awb ? "AWB lookup matched an order." : `Partial AWB lookup "${query}" matched an order.`
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
