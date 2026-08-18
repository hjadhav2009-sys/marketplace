"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { resolveOrderWorkflowProblem } from "@/src/lib/workflow/order-problems";
import { reassignWorkTask, resolveWorkTaskProblem } from "@/src/lib/workflow/task-store";

const value = (form: FormData, name: string, max = 1000) => String(form.get(name) ?? "").normalize("NFKC").trim().slice(0, max);
function returnPath(form: FormData) { const path = value(form, "returnPath", 300); return path.startsWith("/work/problems") && !path.startsWith("//") ? path : "/work/problems"; }
function resultPath(path: string, key: "success" | "error", message: string) { return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`; }

async function run(path: string, success: string, mutation: () => Promise<unknown>) {
  let error: string | null = null;
  try { await mutation(); } catch (cause) { error = cause instanceof Error ? cause.message : "Problem action failed."; }
  revalidatePath("/work/problems");
  revalidatePath("/work");
  redirect(resultPath(path, error ? "error" : "success", error ?? success));
}

export async function resolveOrderProblemWorkspaceAction(form: FormData) {
  const user = await requireUser();
  const account = await requireAccount(user);
  const path = returnPath(form);
  await run(path, "Order problem resolved. The interrupted stage is ready again.", () => resolveOrderWorkflowProblem({
    actorUserId: user.id,
    accountId: account.id,
    problemId: value(form, "problemId", 80),
    resolutionNote: value(form, "resolutionNote", 1000),
    clientRequestId: value(form, "clientRequestId", 160),
  }));
}

export async function resolveConsignmentProblemWorkspaceAction(form: FormData) {
  const user = await requireUser();
  const account = await requireAccount(user);
  const path = returnPath(form);
  await run(path, "Consignment problem resolved. The interrupted stage is ready again.", () => resolveWorkTaskProblem({
    actorUserId: user.id,
    accountId: account.id,
    taskId: value(form, "taskId", 80),
    resolutionNote: value(form, "resolutionNote", 1000),
    clientRequestId: value(form, "clientRequestId", 160),
  }));
}

export async function reassignConsignmentProblemWorkspaceAction(form: FormData) {
  const user = await requireUser();
  const account = await requireAccount(user);
  const path = returnPath(form);
  await run(path, "Problem assignment updated. The problem remains open.", () => reassignWorkTask({
    actorUserId: user.id,
    accountId: account.id,
    taskId: value(form, "taskId", 80),
    assignedUserId: value(form, "assignedUserId", 80) || null,
    clientRequestId: value(form, "clientRequestId", 160),
  }));
}
