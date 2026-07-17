import { createSession } from "@/lib/auth";
import { evaluateLoginCredentials } from "@/lib/auth-helpers";
import { recordAuditLog } from "@/lib/audit";
import { hashPassword, passwordHashNeedsUpgrade } from "@/lib/password";
import {
  checkMobileRateLimit,
  getMobileRequestMeta,
  mobileError,
  mobileJson,
  readMobileJsonBody,
  serializeMobileUser
} from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validators";
import { clearSecurityDimensions, consumeSecurityDimensions } from "@/lib/security-throttle";

export async function POST(request: Request) {
  const limited = checkMobileRateLimit(request, "mobile-login", 10, 60_000);

  if (limited) {
    return limited;
  }

  const body = await readMobileJsonBody(request);

  if (!body.ok) {
    return body.response;
  }

  const parsed = loginSchema.safeParse({
    username: body.data.username,
    password: body.data.password
  });

  if (!parsed.success) {
    return mobileError("invalid_login", "Invalid username or password.", 401);
  }

  const requestMeta = getMobileRequestMeta(request);
  const throttle=await consumeSecurityDimensions({scope:"mobile-login",username:parsed.data.username,ipAddress:requestMeta.ipAddress,usernameLimit:50,ipLimit:10,windowMs:15*60_000,blockMs:5*60_000});if(!throttle.allowed)return mobileError("invalid_login","Invalid username or password.",401);
  const user = await prisma.user.findUnique({
    where: { username: parsed.data.username }
  });
  const loginCheck = evaluateLoginCredentials(user, parsed.data.password);

  if (!user || loginCheck === "invalid_credentials") {
    if (user) {
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
        action: "MOBILE_LOGIN_FAILURE",
        entityType: "User",
        entityId: user.id,
        metadata: { reason: "bad_password", failedLoginCount, throttleKeyHashes: throttle.keyHashes },
        request: requestMeta
      });
    } else {
      await recordAuditLog({
        action: "MOBILE_LOGIN_FAILURE",
        entityType: "User",
        metadata: { reason: "bad_password", failedLoginCount: 0, throttleKeyHashes: throttle.keyHashes },
        request: requestMeta
      });
    }

    return mobileError("invalid_login", "Invalid username or password.", 401);
  }

  if (loginCheck === "inactive") {
    await recordAuditLog({
      userId: user.id,
      accountId: user.accountId,
      action: "MOBILE_LOGIN_FAILURE",
      entityType: "User",
      entityId: user.id,
      metadata: { reason: "inactive" },
      request: requestMeta
    });
    return mobileError("invalid_login", "Invalid username or password.", 401);
  }

  if (loginCheck === "locked") {
    await recordAuditLog({
      userId: user.id,
      accountId: user.accountId,
      action: "MOBILE_LOGIN_FAILURE",
      entityType: "User",
      entityId: user.id,
      metadata: { reason: "locked" },
      request: requestMeta
    });
    return mobileError("invalid_login", "Invalid username or password.", 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: loginCheck === "allowed" && passwordHashNeedsUpgrade(user.passwordHash) ? hashPassword(parsed.data.password) : undefined,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: requestMeta.ipAddress,
      lastUserAgent: requestMeta.userAgent
    }
  });
  await clearSecurityDimensions("mobile-login",parsed.data.username,requestMeta.ipAddress);
  const session = await createSession(user.id, requestMeta);

  await recordAuditLog({
    userId: user.id,
    accountId: user.accountId,
    action: "MOBILE_LOGIN_SUCCESS",
    entityType: "UserDeviceSession",
    entityId: session.id,
    metadata: { mustChangePassword: loginCheck === "must_change_password" },
    request: requestMeta
  });

  return mobileJson({
    ok: true,
    mustChangePassword: loginCheck === "must_change_password",
    user: await serializeMobileUser(user)
  });
}
