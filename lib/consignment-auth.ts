import { redirect } from "next/navigation";
import { capabilityHomePath, requireUser } from "./auth";
import { hasWorkPermission } from "./work-permissions";

export type ConsignmentAccess = "view" | "import" | "manage";

export async function requireConsignmentAccess(access: ConsignmentAccess) {
  const user = await requireUser();
  const allowed = access === "view"
    ? hasWorkPermission(user, "canViewConsignments") || hasWorkPermission(user, "canImportConsignments") || hasWorkPermission(user, "canManageConsignments")
    : access === "import"
      ? hasWorkPermission(user, "canImportConsignments") || hasWorkPermission(user, "canManageConsignments")
      : hasWorkPermission(user, "canManageConsignments");
  if (!allowed) redirect(capabilityHomePath(user));
  return user;
}
