"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { noActiveOrderWorkflowProblem, startOfWorkDay } from "@/lib/operations/work-queue";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import { reportOrderWorkflowProblem } from "@/src/lib/workflow/order-problems";

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
      importedAt: { lt: startOfWorkDay() },
      ...noActiveOrderWorkflowProblem
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
    const activeTasks = await prisma.workTask.findMany({
      where: {
        accountId: order.accountId,
        orderId: order.id,
        sourceType: "ORDER",
        status: { in: ["READY", "IN_PROGRESS"] }
      },
      select: { id: true, stage: true, status: true, version: true },
      orderBy: { sequenceNumber: "asc" },
      take: 2
    });
    const task = activeTasks.length === 1 ? activeTasks[0] : null;

    if (!task) {
      redirect("/owner/old-pending?error=workflow");
    }

    try {
      await reportOrderWorkflowProblem({
        actorUserId: user.id,
        accountId: order.accountId,
        orderId: order.id,
        taskId: task.id,
        stage: task.stage,
        expectedTaskVersion: task.version,
        expectedTaskStatus: task.status,
        reason: "Old pending review",
        note,
        clientRequestId: String(formData.get("clientRequestId") ?? "")
      });
    } catch {
      redirect("/owner/old-pending?error=workflow");
    }

    const marked = await prisma.order.updateMany({
      where: {
        id: order.id,
        accountId: order.accountId,
        importedAt: { lt: startOfWorkDay() },
        workTasks: { some: { id: task.id, status: "PROBLEM" } }
      },
      data: {
        oldPendingReviewStatus: reviewStatus,
        oldPendingReviewedAt: new Date(),
        oldPendingReviewNote: note || "Moved to the current workflow-stage problem queue."
      }
    });
    if (marked.count !== 1) {
      redirect("/owner/old-pending?error=workflow");
    }
  } else {
    const updated = await prisma.order.updateMany({
      where: {
        id: order.id,
        accountId: order.accountId,
        packStatus: "READY",
        importedAt: { lt: startOfWorkDay() },
        ...noActiveOrderWorkflowProblem
      },
      data: {
        oldPendingReviewStatus: reviewStatus,
        oldPendingReviewedAt: new Date(),
        oldPendingReviewNote: note || null
      }
    });
    if (updated.count !== 1) {
      redirect("/owner/old-pending?error=workflow");
    }
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
