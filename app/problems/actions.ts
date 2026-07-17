"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveOrderWorkflowProblem } from "@/src/lib/workflow/order-problems";

export async function resolveProblemOrderAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const problemId = String(formData.get("problemId") ?? "");
  const resolutionNote = String(formData.get("resolutionNote") ?? "").trim().slice(0, 500);
  try {
    await resolveOrderWorkflowProblem({
      actorUserId: user.id,
      accountId: account.id,
      problemId,
      resolutionNote,
      clientRequestId: String(formData.get("clientRequestId") ?? "")
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Problem could not be resolved.";
    redirect(`/problems?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/problems");
  revalidatePath("/picker");
  redirect("/problems?tab=resolved&resolved=1");
}

export async function keepProblemOrderAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
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

  await prisma.auditLog.create({data:{userId:user.id,accountId:account.id,action:"PROBLEM_ORDER_KEPT_OPEN",entityType:"ProblemOrder",entityId:problem.id,metadata:JSON.stringify({hasReviewNote:Boolean(reviewNote)})}});

  revalidatePath("/problems");
  redirect("/problems?kept=1");
}
