"use server";

import { ProcessRoute } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import { requireWorkPermission } from "@/lib/work-permissions";
import { setActiveProcessRule } from "@/src/lib/marking/process-rules";

function value(formData: FormData, name: string, max = 8000) { return String(formData.get(name) ?? "").normalize("NFKC").trim().slice(0, max) || null; }

export async function setProcessRuleAction(formData: FormData) {
  const user = await requireWorkPermission("canManageProcessRules");
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const listingId = value(formData, "listingId", 80);
  const routeValue = value(formData, "route", 40);
  const route = Object.values(ProcessRoute).includes(routeValue as ProcessRoute) ? routeValue as ProcessRoute : null;
  if (!listingId || !route) redirect("/owner/process-rules?error=invalid");

  try {
    const existingRule = await prisma.productProcessRule.findFirst({ where: { accountId: account.id, marketplaceListingId: listingId, active: true }, select: { id: true } });
    const rule = await setActiveProcessRule({
      accountId: account.id,
      marketplaceListingId: listingId,
      route,
      markingAssetId: value(formData, "markingAssetId", 80),
      assemblyTitle: value(formData, "assemblyTitle", 240),
      assemblyInstructions: value(formData, "assemblyInstructions"),
      assemblyImageUrl: value(formData, "assemblyImageUrl", 1000),
      actorUserId: user.id
    });
    await recordAuditLog({ userId: user.id, accountId: account.id, action: existingRule ? "PROCESS_RULE_UPDATED" : "PROCESS_RULE_CREATED", entityType: "ProductProcessRule", entityId: rule.id, metadata: { marketplaceListingId: listingId, route, replacedRuleId: existingRule?.id ?? null }, request });
    revalidatePath("/owner/process-rules");
    redirect("/owner/process-rules?updated=1");
  } catch (error) {
    redirect(`/owner/process-rules?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not save rule.")}`);
  }
}

export async function disableProcessRuleAction(formData: FormData) {
  const user = await requireWorkPermission("canManageProcessRules");
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const ruleId = value(formData, "ruleId", 80);
  if (!ruleId) redirect("/owner/process-rules?error=invalid");
  const result = await prisma.productProcessRule.updateMany({ where: { id: ruleId, accountId: account.id, active: true }, data: { active: false, updatedByUserId: user.id } });
  if (!result.count) redirect("/owner/process-rules?error=forbidden");
  await recordAuditLog({ userId: user.id, accountId: account.id, action: "PROCESS_RULE_DISABLED", entityType: "ProductProcessRule", entityId: ruleId, request });
  revalidatePath("/owner/process-rules");
  redirect("/owner/process-rules?disabled=1");
}
