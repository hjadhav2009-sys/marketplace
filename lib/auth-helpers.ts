import { verifyPassword } from "./password";

export type LoginCheckUser = {
  active: boolean;
  lockedUntil?: Date | null;
  mustChangePassword: boolean;
  passwordHash: string;
};

export type LoginCheckResult = "allowed" | "invalid_credentials" | "inactive" | "locked" | "must_change_password";
export type AuthSessionStatus = "authenticated" | "missing" | "invalid" | "expired" | "inactive";
export type SessionCookieSecureMode = "true" | "false" | "auto";

type CookieSecurityEnv = {
  NEXT_PUBLIC_APP_URL?: string;
  NODE_ENV?: string;
  SESSION_COOKIE_SECURE?: string;
};

export function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function evaluateLoginCredentials(user: LoginCheckUser | null | undefined, password: string, now = new Date()): LoginCheckResult {
  if (!user) {
    return "invalid_credentials";
  }

  if (!user.active) {
    return "inactive";
  }

  if (user.lockedUntil && user.lockedUntil > now) {
    return "locked";
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return "invalid_credentials";
  }

  return user.mustChangePassword ? "must_change_password" : "allowed";
}

export function loginRedirectForResult(result: Exclude<LoginCheckResult, "allowed">) {
  if (result === "must_change_password") {
    return "/change-password?required=1";
  }

  return "/login?error=invalid";
}

export function authRedirectForSessionStatus(status: Exclude<AuthSessionStatus, "authenticated">) {
  if (status === "inactive") {
    return "/auth/session-ended?reason=inactive";
  }

  return "/auth/session-ended?reason=expired";
}

export function normalizeSessionCookieSecureMode(value: string | null | undefined): SessionCookieSecureMode {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "true" || normalized === "false") {
    return normalized;
  }

  return "auto";
}

export function shouldUseSecureSessionCookie(env: CookieSecurityEnv = process.env) {
  const mode = normalizeSessionCookieSecureMode(env.SESSION_COOKIE_SECURE);

  if (mode === "true") {
    return true;
  }

  if (mode === "false") {
    return false;
  }

  return Boolean(env.NEXT_PUBLIC_APP_URL?.trim().toLowerCase().startsWith("https://"));
}

export function sessionCookieSecurityDiagnostics(env: CookieSecurityEnv = process.env) {
  const mode = normalizeSessionCookieSecureMode(env.SESSION_COOKIE_SECURE);
  const secure = shouldUseSecureSessionCookie(env);
  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim() || "";
  const localHttp = appUrl === "" || appUrl.startsWith("http://localhost") || /^http:\/\/(?:10|172\.(?:1[6-9]|2\d|3[01])|192\.168)\./.test(appUrl);

  return {
    mode,
    secure,
    appUrl,
    nodeEnv: env.NODE_ENV ?? "unknown",
    warning: localHttp && secure ? "Local HTTP is using secure cookies. Mobile local-IP login may fail." : null
  };
}
