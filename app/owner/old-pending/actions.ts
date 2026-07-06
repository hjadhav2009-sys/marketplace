"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { startOfWorkDay } from "@/lib/operations/work-queue";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";

const reviewActions = new Set(["keep", "carry-forward", "archive", "problem"]);

function reviewStatusForAction(action: string) {
  if (action === "keep") {
    return "KEEP_PENDING";
  }

  if (action === "carry-forward") {
    return "CARRY_FORWARD";
  }

  if (action === "archive") {
    return "ARCHIVED";
  }

  return "MOVED_TO_PROBLEM";
}

export async function reviewOldPendingOrderAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const request = await getRequestMeta();
  const orderId = String(formData.get("orderId") ?? "");
  const action = String(formData.get("action") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);

  if (!orderId || !reviewActions.has(action)) {
    redirect("/owner/old-pending?error=invalid");
  }

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      packStatus: "READY",
      importedAt: { lt: startOfWorkDay() }
    },
    select: {
      id: true,
      accountId: true,
      awb: true,
      sku: true
    }
  });

  if (!order) {
    redirect("/owner/old-pending?error=missing");
  }

  const reviewStatus = reviewStatusForAction(action);

  if (action === "problem") {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "PROBLEM",
          pickStatus: "PROBLEM",
          packStatus: "PROBLEM",
          oldPendingReviewStatus: reviewStatus,
          oldPendingReviewedAt: new Date(),
          oldPendingReviewNote: note || "Moved to problem from old pending review."
        }
      });

      const existingProblem = await tx.problemOrder.findFirst({
        where: {
          orderId: order.id,
          status: "OPEN"
        },
        select: { id: true }
      });

      if (!existingProblem) {
        await tx.problemOrder.create({
          data: {
            accountId: order.accountId,
            orderId: order.id,
            reason: "Old pending review",
            details: note || "Owner moved old pending order to problem review.",
            reportedById: user.id
          }
        });
      }
    });
  } else {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        oldPendingReviewStatus: reviewStatus,
        oldPendingReviewedAt: new Date(),
        oldPendingReviewNote: note || null
      }
    });
  }

  await recordAuditLog({
    userId: user.id,
    accountId: order.accountId,
    action: "OLD_PENDING_REVIEW_UPDATED",
    entityType: "Order",
    entityId: order.id,
    metadata: {
      reviewAction: action,
      reviewStatus,
      sku: order.sku
    },
    request
  });

  revalidatePath("/owner/old-pending");
  revalidatePath("/picker");
  revalidatePath("/packing");
  redirect(`/owner/old-pending?updated=${reviewStatus}`);
}
