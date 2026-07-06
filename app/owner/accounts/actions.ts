"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import { ownerAccountSchema } from "@/lib/validators";

function redirectWithError(error: string): never {
  redirect(`/owner/accounts?error=${encodeURIComponent(error)}`);
}

export async function saveOwnerAccountAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const selectedAccount = await requireAccount(user);
  const request = await getRequestMeta();
  const parsed = ownerAccountSchema.safeParse({
    accountId: formData.get("accountId") || undefined,
    companyName: formData.get("companyName"),
    marketplace: formData.get("marketplace"),
    accountDisplayName: formData.get("accountDisplayName"),
    accountCode: formData.get("accountCode"),
    active: formData.get("active") === "on",
    notes: formData.get("notes") || undefined
  });

  if (!parsed.success || !parsed.data.accountCode) {
    redirectWithError("invalid");
  }

  const accountInput = parsed.data;
  const accountName = accountInput.accountDisplayName;
  const accountCode = accountInput.accountCode;

  try {
    const account = accountInput.accountId
      ? await prisma.account.update({
          where: { id: accountInput.accountId },
          data: {
            name: accountName,
            code: accountCode,
            companyName: accountInput.companyName,
            marketplace: accountInput.marketplace,
            accountDisplayName: accountName,
            accountCode,
            active: accountInput.active,
            notes: accountInput.notes
          }
        })
      : await prisma.account.create({
          data: {
            name: accountName,
            code: accountCode,
            companyName: accountInput.companyName,
            marketplace: accountInput.marketplace,
            accountDisplayName: accountName,
            accountCode,
            active: accountInput.active,
            notes: accountInput.notes
          }
        });

    await recordAuditLog({
      userId: user.id,
      accountId: selectedAccount.id,
      action: accountInput.accountId ? "OWNER_ACCOUNT_UPDATED" : "OWNER_ACCOUNT_CREATED",
      entityType: "Account",
      entityId: account.id,
      metadata: {
        accountId: account.id,
        companyName: account.companyName,
        marketplace: account.marketplace,
        accountDisplayName: account.accountDisplayName ?? account.name,
        accountCode: account.accountCode ?? account.code,
        active: account.active
      },
      request
    });
  } catch {
    redirectWithError("duplicate");
  }

  revalidatePath("/owner/accounts");
  revalidatePath("/accounts");
  redirect("/owner/accounts?saved=1");
}

export async function toggleOwnerAccountActiveAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const selectedAccount = await requireAccount(user);
  const request = await getRequestMeta();
  const accountId = String(formData.get("accountId") ?? "");
  const active = formData.get("active") === "true";

  if (!accountId) {
    redirectWithError("invalid");
  }

  const account = await prisma.account.update({
    where: { id: accountId },
    data: { active }
  });

  await recordAuditLog({
    userId: user.id,
    accountId: selectedAccount.id,
    action: active ? "OWNER_ACCOUNT_REACTIVATED" : "OWNER_ACCOUNT_DEACTIVATED",
    entityType: "Account",
    entityId: account.id,
    metadata: {
      accountId: account.id,
      name: account.name,
      code: account.code,
      active: account.active
    },
    request
  });

  revalidatePath("/owner/accounts");
  revalidatePath("/accounts");
  redirect(active ? "/owner/accounts?reactivated=1" : "/owner/accounts?deactivated=1");
}
