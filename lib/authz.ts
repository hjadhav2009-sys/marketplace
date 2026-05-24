import type { Role, User } from "@prisma/client";

const ownerPrefixes = ["/owner", "/picker", "/packing", "/problems", "/reports", "/accounts"];
const pickerPrefixes = ["/picker", "/accounts"];
const packerPrefixes = ["/packing", "/problems", "/accounts"];

export function canRoleAccessPath(role: Role, pathname: string) {
  if (pathname === "/" || pathname === "/login" || pathname === "/network-blocked") {
    return true;
  }

  const prefixes = role === "OWNER" ? ownerPrefixes : role === "PICKER" ? pickerPrefixes : packerPrefixes;
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function canAccessAccount(user: Pick<User, "role" | "accountId">, accountId: string) {
  return user.role === "OWNER" || user.accountId === accountId;
}
