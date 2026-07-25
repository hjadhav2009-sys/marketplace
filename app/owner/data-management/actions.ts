"use server";

import { redirect } from "next/navigation";
import { getCurrentSessionId, requireUser } from "@/lib/auth";
import { sanitizePublicActionError } from "@/src/lib/import-jobs/safe-error";
import {
  createOwnerActionGrant,
  executeDataAction,
  findCompletedDataActionReplay,
  previewDataAction,
  type DataActionKind,
  type DataActionScope
} from "@/src/lib/data-management/service";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

function scopeFrom(formData: FormData): DataActionScope {
  const pairs = [
    ["accountId", text(formData, "accountId")],
    ["importJobId", text(formData, "importJobId")],
    ["consignmentFileId", text(formData, "consignmentFileId")],
    ["listingId", text(formData, "marketplaceListingId")],
    ["deletionJobId", text(formData, "deletionJobId")]
  ] as const;
  return Object.fromEntries(pairs.filter(([, value]) => value)) as DataActionScope;
}

export async function executeOwnerDataAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const sessionId = await getCurrentSessionId();
  if (!sessionId) redirect("/login");
  const actionKind = text(formData, "actionKind") as DataActionKind;
  const scope = scopeFrom(formData);
  const clientRequestId = text(formData, "clientRequestId");
  const returnTab = encodeURIComponent(text(formData, "returnTab") || "overview");
  try {
    const replay = await findCompletedDataActionReplay({ actorUserId: user.id, actionKind, clientRequestId, scope });
    if (!replay) {
      const preview = await previewDataAction(user.id, actionKind, scope);
      const grantToken = await createOwnerActionGrant({
        actorUserId: user.id,
        sessionId,
        actionKind,
        scopeFingerprint: preview.scopeFingerprint,
        password: String(formData.get("ownerPassword") ?? "")
      });
      await executeDataAction({
        actorUserId: user.id,
        sessionId,
        grantToken,
        clientRequestId,
        actionKind,
        scope,
        typedPhrase: text(formData, "confirmationPhrase")
      });
    }
  } catch (error) {
    const message = encodeURIComponent(sanitizePublicActionError(error, "The data-management action failed safely.") ?? "The data-management action failed safely.");
    redirect(`/owner/data-management?tab=${returnTab}&error=${message}`);
  }
  redirect(`/owner/data-management?tab=${returnTab}&success=1`);
}
