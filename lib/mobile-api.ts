import { NextResponse } from "next/server";
import type { Account, Role, User } from "@prisma/client";
import { getAvailableAccounts, getCurrentSessionState } from "@/lib/auth";
import { getSafeClientIp, shouldTrustProxyHeaders, type RequestMeta } from "@/lib/network";
import { prisma } from "@/lib/prisma";
import type { MobileAccount, MobileApiError, MobileUser } from "@/src/lib/mobile-api/types";

const MOBILE_JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json"
};

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function mobileJson<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...MOBILE_JSON_HEADERS,
      ...init?.headers
    }
  });
}

export function mobileError(code: string, message: string, status = 400, extra?: Partial<MobileApiError["error"]>) {
  return mobileJson<MobileApiError>(
    {
      ok: false,
      error: {
        code,
        message,
        ...extra
      }
    },
    { status }
  );
}

export async function readMobileJsonBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false as const, response: mobileError("json_required", "Send application/json request body.", 415) };
  }

  try {
    return { ok: true as const, data: (await request.json()) as Record<string, unknown> };
  } catch {
    return { ok: false as const, response: mobileError("bad_json", "Request body is not valid JSON.", 400) };
  }
}

export function getMobileRequestMeta(request: Request): RequestMeta {
  return {
    ipAddress: getSafeClientIp(request.headers, { trustProxyHeaders: shouldTrustProxyHeaders() }),
    userAgent: request.headers.get("user-agent") ?? undefined
  };
}

export function checkMobileRateLimit(request: Request, scope: string, limit: number, windowMs: number) {
  const meta = getMobileRequestMeta(request);
  const key = `${scope}:${meta.ipAddress ?? "unknown"}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    return mobileError("rate_limited", "Too many requests. Try again shortly.", 429);
  }

  return null;
}

export function serializeMobileAccount(account: Account): MobileAccount {
  return {
    id: account.id,
    companyName: account.companyName,
    marketplace: account.marketplace,
    name: account.accountDisplayName ?? account.name,
    code: account.accountCode ?? account.code,
    active: account.active
  };
}

export async function serializeMobileUser(user: User): Promise<MobileUser> {
  const accounts = await getAvailableAccounts(user);

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    accounts: accounts.map(serializeMobileAccount)
  };
}

export async function getMobileUser(roles?: Role[]) {
  const session = await getCurrentSessionState();

  if (session.status !== "authenticated") {
    return { ok: false as const, response: mobileError("unauthorized", "Login required.", 401) };
  }

  const user = session.user;

  if (roles && !roles.includes(user.role)) {
    return { ok: false as const, response: mobileError("forbidden", "This mobile action is not allowed for your role.", 403) };
  }

  if (user.mustChangePassword) {
    return {
      ok: false as const,
      response: mobileError("must_change_password", "Password change required before using the mobile app.", 403, {
        mustChangePassword: true
      })
    };
  }

  return { ok: true as const, user };
}

export async function resolveMobileAccount(user: User, accountId: unknown) {
  const requestedAccountId = String(accountId ?? user.accountId ?? "").trim();
  const accounts = await getAvailableAccounts(user);

  if (requestedAccountId) {
    const account = accounts.find((candidate) => candidate.id === requestedAccountId);

    if (!account) {
      return { ok: false as const, response: mobileError("account_forbidden", "Selected account is not available to this user.", 403) };
    }

    return { ok: true as const, account };
  }

  const account = accounts[0];

  if (!account) {
    return { ok: false as const, response: mobileError("no_account", "No active seller account is assigned.", 403) };
  }

  return { ok: true as const, account };
}

export async function getMobileAccountContext(request: Request, roles: Role[], accountId?: unknown) {
  const auth = await getMobileUser(roles);

  if (!auth.ok) {
    return auth;
  }

  const selectedAccountId = accountId ?? new URL(request.url).searchParams.get("accountId");
  const account = await resolveMobileAccount(auth.user, selectedAccountId);

  if (!account.ok) {
    return account;
  }

  return {
    ok: true as const,
    user: auth.user,
    account: account.account
  };
}

export function compactMobileError(error: unknown) {
  if (error instanceof Error && error.message === "Image URL host is not allowed for server-side caching.") {
    return mobileError("image_blocked", "Image URL is not allowed.", 400);
  }

  return mobileError("server_error", "Mobile API request failed.", 500);
}

export async function getAccountScopedOrder(accountId: string, orderId: unknown) {
  const id = String(orderId ?? "").trim();

  if (!id) {
    return null;
  }

  return prisma.order.findFirst({
    where: {
      id,
      accountId
    }
  });
}
