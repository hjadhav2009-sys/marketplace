import { verifyPassword } from "./password";

export type LoginCheckUser = {
  active: boolean;
  lockedUntil?: Date | null;
  mustChangePassword: boolean;
  passwordHash: string;
};

export type LoginCheckResult = "allowed" | "invalid_credentials" | "inactive" | "locked" | "must_change_password";
export type AuthSessionStatus = "authenticated" | "missing" | "invalid" | "expired" | "inactive";

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
  if (result === "inactive") {
    return "/login?inactive=1";
  }

  if (result === "locked") {
    return "/login?error=locked";
  }

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
