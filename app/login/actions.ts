"use server";

import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { evaluateLoginCredentials, loginRedirectForResult } from "@/lib/auth-helpers";
import { recordAuditLog } from "@/lib/audit";
import { hashPassword, passwordHashNeedsUpgrade } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import { loginSchema } from "@/lib/validators";
import { clearSecurityDimensions, consumeSecurityDimensions } from "@/lib/security-throttle";

export async function loginAction(formData: FormData) {
  const request = await getRequestMeta();
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password")
  });

  if (!parsed.success) {
    redirect("/login?error=invalid");
  }

  const throttle = await consumeSecurityDimensions({ scope: "web-login", username: parsed.data.username, ipAddress: request.ipAddress, usernameLimit: 50, ipLimit: 10, windowMs: 15 * 60_000, blockMs: 5 * 60_000 });
  if (!throttle.allowed) redirect("/login?error=invalid");

  const user = await prisma.user.findUnique({
    where: { username: parsed.data.username }
  });

  if (!user) {
    await recordAuditLog({
      action: "LOGIN_FAILURE",
      entityType: "User",
      metadata: { reason: "bad_password", failedLoginCount: 0, throttleKeyHashes: throttle.keyHashes },
      request
    });
    redirect("/login?error=invalid");
  }

  const loginCheck = evaluateLoginCredentials(user, parsed.data.password);

  if (loginCheck === "inactive") {
    await recordAuditLog({
      userId: user.id,
      accountId: user.accountId,
      action: "LOGIN_FAILURE",
      entityType: "User",
      entityId: user.id,
      metadata: { reason: "inactive", throttleKeyHashes: throttle.keyHashes },
      request
    });
    redirect("/login?error=invalid");
  }

  if (loginCheck === "locked") {
    await recordAuditLog({
      userId: user.id,
      accountId: user.accountId,
      action: "LOGIN_FAILURE",
      entityType: "User",
      entityId: user.id,
      metadata: { reason: "locked" },
      request
    });
    redirect("/login?error=invalid");
  }

  if (loginCheck === "invalid_credentials") {
    const failedLoginCount = user.failedLoginCount + 1;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount
      }
    });

    await recordAuditLog({
      userId: user.id,
      accountId: user.accountId,
      action: "LOGIN_FAILURE",
      entityType: "User",
      entityId: user.id,
      metadata: { reason: "bad_password", failedLoginCount, throttleKeyHashes: throttle.keyHashes },
      request
    });
    redirect("/login?error=invalid");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: loginCheck === "allowed" && passwordHashNeedsUpgrade(user.passwordHash) ? hashPassword(parsed.data.password) : undefined,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: request.ipAddress,
      lastUserAgent: request.userAgent
    }
  });
  await clearSecurityDimensions("web-login", parsed.data.username, request.ipAddress);
  let session;

  try {
    session = await createSession(user.id, request);
  } catch {
    await recordAuditLog({
      userId: user.id,
      accountId: user.accountId,
      action: "LOGIN_FAILURE",
      entityType: "User",
      entityId: user.id,
      metadata: { reason: "session_creation_failed" },
      request
    });
    redirect("/login?error=session");
  }

  await recordAuditLog({
    userId: user.id,
    accountId: user.accountId,
    action: "LOGIN_SUCCESS",
    entityType: "UserDeviceSession",
    entityId: session.id,
    request
  });

  if (loginCheck === "must_change_password") {
    redirect(loginRedirectForResult(loginCheck));
  }

  redirect("/accounts");
}
