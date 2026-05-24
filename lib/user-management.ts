import type { Role } from "@prisma/client";

const forbiddenPasswords = new Set(["demo1234", "password", "password123"]);

export function validateWorkerPassword(password: string) {
  const trimmed = password.trim();

  if (trimmed.length < 8) {
    return { valid: false, message: "Password must be at least 8 characters." };
  }

  if (forbiddenPasswords.has(trimmed.toLowerCase())) {
    return { valid: false, message: "Choose a password that is not a demo password." };
  }

  return { valid: true, message: null };
}

export function getWeakPasswordWarning(password: string) {
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  if (password.length >= 12 && hasLetter && hasNumber && hasSymbol) {
    return null;
  }

  return "Use a longer password with letters, numbers, and a symbol for production.";
}

export function canDeactivateUser(actorId: string, targetId: string) {
  return actorId !== targetId;
}

export function canChangeUserRole(actorId: string, targetId: string, currentRole: Role, nextRole: Role) {
  if (actorId === targetId && currentRole === "OWNER" && nextRole !== "OWNER") {
    return false;
  }

  return true;
}

export function shouldCloseSessionsAfterPasswordReset(actorId: string, targetId: string) {
  return actorId !== targetId;
}
