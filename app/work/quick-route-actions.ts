"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { completeStageAndChooseNext } from "@/src/lib/workflow/stage-transition";

const value = (form: FormData, name: string, max = 200) => String(form.get(name) ?? "").normalize("NFKC").trim().slice(0, max);
const number = (form: FormData, name: string) => Number(value(form, name, 30));
const returnPath = (form: FormData) => {
  const path = value(form, "returnPath", 300);
  return path.startsWith("/work/") && !path.startsWith("//") ? path : "/work/marking";
};

export async function completeQuickStageRouteAction(form: FormData) {
  const user = await requireUser();
  const account = await requireAccount(user);
  const stage = value(form, "stage", 20);
  const path = returnPath(form);
  let error = "";
  try {
    if (stage !== "MARK") throw new Error("Only individual Marking work supports this quick Process Flow action.");
    await completeStageAndChooseNext({
      actorUserId: user.id,
      selectedAccountId: account.id,
      taskId: value(form, "taskId", 80),
      currentStage: "MARK",
      expectedVersion: number(form, "expectedVersion"),
      expectedCompletedQuantity: number(form, "expectedQuantity"),
      nextStage: value(form, "nextStage", 20) as "ASSEMBLE" | "PACK",
      useRecommendedNextStage: value(form, "useRecommended", 5) === "1",
      routeReason: value(form, "routeReason", 80) || undefined,
      routeOtherReason: value(form, "routeOtherReason", 240) || undefined,
      workerNote: value(form, "workerNote", 240) || undefined,
      confirmMissingInstructions: value(form, "confirmMissingInstructions", 5) === "1",
      clientRequestId: value(form, "clientRequestId", 120),
    });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Could not route Marking work.";
  }
  for (const route of ["mark", "marking", "assemble", "assembly", "pack", "consignments/pack"]) revalidatePath(`/work/${route}`);
  revalidatePath("/work");
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${error ? `error=${encodeURIComponent(error)}` : `success=${encodeURIComponent("Marking completed and routed.")}`}`);
}
