"use server";

import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { hasWorkPermission } from "@/lib/work-permissions";

const RETIRED_MESSAGE = "Legacy SKU-group mutations were retired. Use the source-aware Pick queue and exact Work Details.";

async function assertPickAccess() {
  const user = await requireUser();
  await requireAccount(user);
  if (!hasWorkPermission(user, "canPick")) redirect("/dashboard");
}

export async function markSkuGroupPickedAction(formData: FormData) {
  void formData;
  await assertPickAccess();
  redirect(`/work/pick?source=ORDER&error=${encodeURIComponent(RETIRED_MESSAGE)}`);
}

export async function markSkuGroupPickedInlineAction(formData: FormData) {
  void formData;
  await assertPickAccess();
  return { ok: false, updatedRows: 0, error: RETIRED_MESSAGE };
}

export async function markSkuGroupProblemAction(formData: FormData) {
  void formData;
  await assertPickAccess();
  redirect(`/work/pick?source=ORDER&error=${encodeURIComponent(RETIRED_MESSAGE)}`);
}

export async function markSkuGroupProblemInlineAction(formData: FormData) {
  void formData;
  await assertPickAccess();
  return { ok: false, affectedOrders: 0, createdProblems: 0, error: RETIRED_MESSAGE };
}
