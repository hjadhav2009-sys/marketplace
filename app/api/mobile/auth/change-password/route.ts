import { recordAuditLog } from "@/lib/audit";
import { getCurrentSessionState } from "@/lib/auth";
import { getMobileRequestMeta, mobileError, mobileJson, readMobileJsonBody, serializeMobileUser } from "@/lib/mobile-api";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { validateWorkerPassword } from "@/lib/user-management";

export async function POST(request: Request) {
  const body = await readMobileJsonBody(request);

  if (!body.ok) {
    return body.response;
  }

  const session = await getCurrentSessionState();

  if (session.status !== "authenticated") {
    return mobileError("unauthorized", "Login required.", 401);
  }

  const currentPassword = String(body.data.currentPassword ?? "");
  const newPassword = String(body.data.newPassword ?? "");
  const confirmPassword = String(body.data.confirmPassword ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return mobileError("missing_password", "Current password and new password are required.", 400);
  }

  if (newPassword !== confirmPassword) {
    return mobileError("password_mismatch", "New password and confirmation do not match.", 400);
  }

  const passwordResult = validateWorkerPassword(newPassword);

  if (!passwordResult.valid) {
    return mobileError("weak_password", passwordResult.message ?? "Choose a stronger password.", 400);
  }

  const fullUser = await prisma.user.findUnique({
    where: { id: session.user.id }
  });

  if (!fullUser || !verifyPassword(currentPassword, fullUser.passwordHash)) {
    return mobileError("invalid_current_password", "Current password is incorrect.", 401);
  }

  const updatedUser = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      passwordHash: hashPassword(newPassword),
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null
    }
  });

  await recordAuditLog({
    userId: updatedUser.id,
    accountId: updatedUser.accountId,
    action: "MOBILE_USER_PASSWORD_CHANGED",
    entityType: "User",
    entityId: updatedUser.id,
    metadata: { changedBy: "self" },
    request: getMobileRequestMeta(request)
  });

  return mobileJson({
    ok: true,
    user: await serializeMobileUser(updatedUser)
  });
}
