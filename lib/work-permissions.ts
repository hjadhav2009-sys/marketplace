import type { User } from "@prisma/client";
import { redirect } from "next/navigation";
import { capabilityHomePath, requireUser } from "./auth";

export type WorkPermission =
  | "canPick"
  | "canMark"
  | "canAssemble"
  | "canPack"
  | "canReportProblem"
  | "canManageMarkingLibrary"
  | "canManageProcessRules"
  | "canViewAllWork"
  | "canViewConsignments"
  | "canImportConsignments"
  | "canManageConsignments";

export type WorkPermissionUser = Pick<
  User,
  "role" | "canPick" | "canMark" | "canAssemble" | "canPack" | "canReportProblem" | "canManageMarkingLibrary" | "canManageProcessRules" | "canViewAllWork" | "canViewConsignments" | "canImportConsignments" | "canManageConsignments"
>;

export function hasWorkPermission<Permission extends WorkPermission>(user: Pick<WorkPermissionUser, "role" | Permission> & Partial<Omit<WorkPermissionUser, "role" | Permission>>, permission: Permission) {
  if (user.role === "OWNER") return true;
  return user[permission];
}

export async function requireWorkPermission(permission: WorkPermission) {
  const user = await requireUser();

  if (!hasWorkPermission(user, permission)) {
    redirect(capabilityHomePath(user));
  }

  return user;
}
