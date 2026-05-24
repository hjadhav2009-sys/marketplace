"use server";

import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import { loginSchema } from "@/lib/validators";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export async function loginAction(formData: FormData) {
  const request = await getRequestMeta();
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password")
  });

  if (!parsed.success) {
    redirect("/login?error=invalid");
  }

  const user = await prisma.user.findUnique({
    where: { username: parsed.data.username }
  });

  if (!user || !user.active) {
    await recordAuditLog({
      userId: user?.id,
      accountId: user?.accountId,
      action: "LOGIN_FAILURE",
      entityType: "User",
      entityId: user?.id,
      metadata: { reason: "invalid_credentials_or_inactive", username: parsed.data.username },
      request
    });
    redirect("/login?error=invalid");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAuditLog({
      userId: user.id,
      accountId: user.accountId,
      action: "LOGIN_FAILURE",
      entityType: "User",
      entityId: user.id,
      metadata: { reason: "locked" },
      request
    });
    redirect("/login?error=locked");
  }

  if (!verifyPassword(parsed.data.password, user.passwordHash)) {
    const failedLoginCount = user.failedLoginCount + 1;
    const lockedUntil = failedLoginCount >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount,
        lockedUntil
      }
    });

    await recordAuditLog({
      userId: user.id,
      accountId: user.accountId,
      action: "LOGIN_FAILURE",
      entityType: "User",
      entityId: user.id,
      metadata: { reason: lockedUntil ? "locked_after_failures" : "bad_password", failedLoginCount },
      request
    });
    redirect(lockedUntil ? "/login?error=locked" : "/login?error=invalid");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: request.ipAddress,
      lastUserAgent: request.userAgent
    }
  });
  const session = await createSession(user.id, request);

  await recordAuditLog({
    userId: user.id,
    accountId: user.accountId,
    action: "LOGIN_SUCCESS",
    entityType: "UserDeviceSession",
    entityId: session.id,
    request
  });

  if (user.mustChangePassword) {
    redirect("/change-password?required=1");
  }

  redirect("/accounts");
}
