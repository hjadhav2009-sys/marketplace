"use server";

import { redirect } from "next/navigation";
import { normalizeUsername } from "@/lib/auth-helpers";
import { recordAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import { consumeSecurityDimensions } from "@/lib/security-throttle";

export async function forgotPasswordRequestAction(formData: FormData) {
  const request = await getRequestMeta();
  const username = normalizeUsername(formData.get("username"));

  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    redirect("/forgot-password?sent=1");
  }

  const throttle = await consumeSecurityDimensions({ scope: "forgot-password", username, ipAddress: request.ipAddress, usernameLimit: 1, ipLimit: 5, windowMs: 15 * 60_000, blockMs: 15 * 60_000 });
  if (!throttle.allowed) redirect("/forgot-password?sent=1");

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      accountId: true
    }
  });

  const recent = await prisma.passwordResetRequest.findFirst({ where: { username, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } }, select: { id: true } });
  if (!recent) await prisma.passwordResetRequest.create({
    data: {
      username,
      userId: user?.id,
      note: user ? "Worker requested owner password reset." : "Password reset request submitted for review."
    }
  });

  await recordAuditLog({
    userId: user?.id,
    accountId: user?.accountId,
    action: "PASSWORD_RESET_REQUESTED",
    entityType: "PasswordResetRequest",
    metadata: {
      usernameKnown: Boolean(user),
      throttleKeyHashes: throttle.keyHashes,
      deduplicated: Boolean(recent)
    },
    request
  });

  redirect("/forgot-password?sent=1");
}
