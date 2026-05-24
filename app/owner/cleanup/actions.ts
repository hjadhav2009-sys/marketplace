"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { cleanupTarget } from "@/lib/cleanup";
import { getRequestMeta } from "@/lib/request-context";
import { cleanupTargetLabels, isCleanupConfirmationValid, isCleanupTarget } from "@/lib/retention";

export async function cleanupDataAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const target = String(formData.get("target") ?? "");
  const confirmation = formData.get("confirmation");

  if (!isCleanupTarget(target) || !isCleanupConfirmationValid(confirmation)) {
    redirect("/owner/cleanup?error=confirm");
  }

  const result = await cleanupTarget(target);

  await recordAuditLog({
    userId: user.id,
    accountId: account.id,
    action: "CLEANUP_OLD_DATA",
    entityType: "Cleanup",
    entityId: target,
    metadata: {
      target,
      label: cleanupTargetLabels[target],
      deletedRows: result.count
    },
    request
  });

  revalidatePath("/owner/cleanup");
  revalidatePath("/owner/system");
  redirect(`/owner/cleanup?cleaned=${target}&count=${result.count}`);
}
