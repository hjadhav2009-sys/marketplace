"use server";

import { redirect } from "next/navigation";
import { clearSession, requireUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import { validateWorkerPassword } from "@/lib/user-management";

export async function changeOwnPasswordAction(formData: FormData) {
  const user = await requireUser(undefined, { allowPasswordChangeRequired: true });
  const request = await getRequestMeta();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id }
  });

  if (!fullUser || !verifyPassword(currentPassword, fullUser.passwordHash)) {
    redirect("/change-password?error=current");
  }

  if (newPassword !== confirmPassword) {
    redirect("/change-password?error=mismatch");
  }

  const passwordResult = validateWorkerPassword(newPassword);

  if (!passwordResult.valid) {
    redirect("/change-password?error=weak");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hashPassword(newPassword),
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null
    }
  });

  await recordAuditLog({
    userId: user.id,
    accountId: user.accountId,
    action: "USER_PASSWORD_CHANGED",
    entityType: "User",
    entityId: user.id,
    metadata: { changedBy: "self" },
    request
  });

  redirect("/accounts");
}

export async function logoutFromPasswordChangeAction() {
  const user = await requireUser(undefined, { allowPasswordChangeRequired: true });
  const request = await getRequestMeta();

  await recordAuditLog({
    userId: user.id,
    accountId: user.accountId,
    action: "LOGOUT",
    entityType: "User",
    entityId: user.id,
    request
  });

  await clearSession();
  redirect("/login");
}
