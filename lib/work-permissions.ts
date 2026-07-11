import type { User } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireUser, roleHomePath } from "./auth";

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

export function hasWorkPermission(user: WorkPermissionUser, permission: WorkPermission) {
  if (user.role === "OWNER") return true;
  if (permission === "canPick" && user.role === "PICKER") return true;
  if (permission === "canPack" && user.role === "PACKER") return true;
  return user[permission];
}

export async function requireWorkPermission(permission: WorkPermission) {
  const user = await requireUser();

  if (!hasWorkPermission(user, permission)) {
    redirect(roleHomePath(user.role));
  }

  return user;
}
