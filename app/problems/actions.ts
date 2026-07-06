"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";

export async function resolveProblemOrderAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const problemId = String(formData.get("problemId") ?? "");
  const resolutionNote = String(formData.get("resolutionNote") ?? "").trim().slice(0, 500);
  const returnToReady = formData.get("returnToReady") === "1";

  const problem = await prisma.problemOrder.findFirst({
    where: {
      id: problemId,
      accountId: account.id
    },
    include: {
      order: true
    }
  });

  if (!problem) {
    redirect("/problems?error=invalid");
  }

  await prisma.$transaction(async (tx) => {
    await tx.problemOrder.update({
      where: { id: problem.id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolutionNote: resolutionNote || null
      }
    });

    if (returnToReady) {
      await tx.order.update({
        where: { id: problem.orderId },
        data: {
          status: "READY",
          pickStatus: "READY",
          packStatus: "READY"
        }
      });
    }

    await tx.scanLog.create({
      data: {
        accountId: account.id,
        orderId: problem.orderId,
        awb: problem.order.awb,
        outcome: "FOUND",
        scannedById: user.id,
        note: returnToReady ? "Problem resolved; order returned to ready queue." : "Problem resolved; order history kept in current state."
      }
    });
  });

  await recordAuditLog({
    userId: user.id,
    accountId: account.id,
    action: "PROBLEM_ORDER_RESOLVED",
    entityType: "ProblemOrder",
    entityId: problem.id,
    metadata: { returnedToReady: returnToReady },
    request
  });

  revalidatePath("/problems");
  revalidatePath("/picker");
  redirect("/problems?tab=resolved&resolved=1");
}

export async function keepProblemOrderAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const problemId = String(formData.get("problemId") ?? "");
  const reviewNote = String(formData.get("resolutionNote") ?? "").trim().slice(0, 500);
  const problem = await prisma.problemOrder.findFirst({
    where: {
      id: problemId,
      accountId: account.id
    },
    include: {
      order: true
    }
  });

  if (!problem) {
    redirect("/problems?error=invalid");
  }

  await recordAuditLog({
    userId: user.id,
    accountId: account.id,
    action: "PROBLEM_ORDER_KEPT_OPEN",
    entityType: "ProblemOrder",
    entityId: problem.id,
    metadata: {
      hasReviewNote: Boolean(reviewNote)
    },
    request
  });

  revalidatePath("/problems");
  redirect("/problems?kept=1");
}
