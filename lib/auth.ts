import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Account, Role, User } from "@prisma/client";
import type { RequestMeta } from "./network";
import { prisma } from "./prisma";

const SESSION_COOKIE = "mpp_session";
const ACCOUNT_COOKIE = "mpp_account";
const SESSION_MAX_AGE = 60 * 60 * 12;

type SessionPayload = {
  userId: string;
  sessionId: string;
};

function getSecret() {
  return process.env.SESSION_SECRET ?? "dev-only-change-me";
}

function encodePayload(payload: SessionPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function verifySignedCookie(value: string | undefined) {
  if (!value) {
    return null;
  }

  const [payload, signature] = value.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = sign(payload);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(userId: string, request?: RequestMeta) {
  const cookieStore = await cookies();
  const session = await prisma.userDeviceSession.create({
    data: {
      userId,
      ipAddress: request?.ipAddress,
      userAgent: request?.userAgent,
      active: true
    }
  });
  const payload = encodePayload({ userId, sessionId: session.id });

  cookieStore.set(SESSION_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE
  });

  return session;
}

export async function clearSession() {
  const cookieStore = await cookies();
  const payload = verifySignedCookie(cookieStore.get(SESSION_COOKIE)?.value);

  if (payload?.sessionId) {
    await prisma.userDeviceSession.updateMany({
      where: {
        id: payload.sessionId,
        userId: payload.userId
      },
      data: {
        active: false,
        lastSeenAt: new Date()
      }
    });
  }

  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(ACCOUNT_COOKIE);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const payload = verifySignedCookie(cookieStore.get(SESSION_COOKIE)?.value);

  if (!payload?.userId || !payload.sessionId) {
    return null;
  }

  const user = await prisma.user.findFirst({
    where: {
      id: payload.userId,
      active: true,
      sessions: {
        some: {
          id: payload.sessionId,
          active: true
        }
      }
    }
  });

  if (!user) {
    return null;
  }

  await prisma.userDeviceSession.updateMany({
    where: {
      id: payload.sessionId,
      userId: user.id,
      active: true
    },
    data: {
      lastSeenAt: new Date()
    }
  });

  return user;
}

export async function requireUser(roles?: Role[], options?: { allowPasswordChangeRequired?: boolean }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.mustChangePassword && !options?.allowPasswordChangeRequired) {
    redirect("/change-password?required=1");
  }

  if (roles && !roles.includes(user.role)) {
    redirect(roleHomePath(user.role));
  }

  return user;
}

export async function setSelectedAccount(accountId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACCOUNT_COOKIE, accountId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE
  });
}

export async function getSelectedAccount(user?: User | null) {
  const currentUser = user ?? (await getCurrentUser());

  if (!currentUser) {
    return null;
  }

  const cookieStore = await cookies();
  const selectedAccountId = cookieStore.get(ACCOUNT_COOKIE)?.value ?? currentUser.accountId;

  if (!selectedAccountId) {
    return null;
  }

  return prisma.account.findFirst({
    where: {
      id: selectedAccountId,
      users: currentUser.role === "OWNER" ? undefined : { some: { id: currentUser.id } }
    }
  });
}

export async function requireAccount(user?: User | null) {
  const account = await getSelectedAccount(user);

  if (!account) {
    redirect("/accounts");
  }

  return account;
}

export async function getAvailableAccounts(user: User) {
  if (user.role === "OWNER") {
    return prisma.account.findMany({
      orderBy: { name: "asc" }
    });
  }

  return prisma.account.findMany({
    where: {
      users: {
        some: { id: user.id }
      }
    },
    orderBy: { name: "asc" }
  });
}

export function roleHomePath(role: Role) {
  if (role === "OWNER") {
    return "/owner";
  }

  if (role === "PICKER") {
    return "/picker";
  }

  return "/packing";
}

export type AuthContext = {
  user: User;
  account: Account;
};
