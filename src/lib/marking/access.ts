import type { Prisma, User } from "@prisma/client";
import { hasWorkPermission } from "@/lib/work-permissions";

export function canManageMarkingLibrary(user: User) {
  return hasWorkPermission(user, "canManageMarkingLibrary");
}

export function canManageProcessRules(user: User) {
  return hasWorkPermission(user, "canManageProcessRules");
}

export function markingAssetAccessWhere(user: User, accountId: string): Prisma.MarkingAssetWhereInput {
  if (user.role === "OWNER") return {};
  return {
    OR: [
      { createdByUserId: user.id },
      { listingLinks: { some: { accountId, active: true } } }
    ]
  };
}
