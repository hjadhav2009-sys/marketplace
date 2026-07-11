import type { Role, User } from "@prisma/client";

export type MobilePermissionSet = {
  canPick: boolean;
  canPack: boolean;
  canReportProblem: boolean;
  canMark: boolean;
  canAssemble: boolean;
  canManageMarkingLibrary: boolean;
  canManageProcessRules: boolean;
  canViewAllWork: boolean;
  canViewConsignments: boolean;
  canImportConsignments: boolean;
  canManageConsignments: boolean;
  canViewAssignedProblems: boolean;
  canViewDashboard: boolean;
  canImportOrders: boolean;
  canImportListings: boolean;
  canViewImports: boolean;
  canManageListings: boolean;
  canManageAccounts: boolean;
  canManageUsers: boolean;
  canViewReports: boolean;
  canResolveProblems: boolean;
  canViewSystem: boolean;
  canReviewOldPending: boolean;
};

export type MobileTab = "dashboard" | "work" | "picker" | "packing" | "problems" | "imports" | "reports" | "admin" | "account";

type PermissionUser = Pick<User, "role" | "canPick" | "canPack" | "canReportProblem"> & Partial<Pick<User, "canMark" | "canAssemble" | "canManageMarkingLibrary" | "canManageProcessRules" | "canViewAllWork" | "canViewConsignments" | "canImportConsignments" | "canManageConsignments">>;

export function getMobilePermissions(user: PermissionUser): MobilePermissionSet {
  const isOwner = user.role === "OWNER";
  const canPick = isOwner || user.role === "PICKER" || user.canPick;
  const canPack = isOwner || user.role === "PACKER" || user.canPack;
  const canReportProblem = isOwner || user.canReportProblem || user.role === "PICKER" || user.role === "PACKER";

  return {
    canPick,
    canPack,
    canReportProblem,
    canMark: isOwner || Boolean(user.canMark),
    canAssemble: isOwner || Boolean(user.canAssemble),
    canManageMarkingLibrary: isOwner || Boolean(user.canManageMarkingLibrary),
    canManageProcessRules: isOwner || Boolean(user.canManageProcessRules),
    canViewAllWork: isOwner || Boolean(user.canViewAllWork),
    canViewConsignments: isOwner || Boolean(user.canViewConsignments),
    canImportConsignments: isOwner || Boolean(user.canImportConsignments),
    canManageConsignments: isOwner || Boolean(user.canManageConsignments),
    canViewAssignedProblems: canReportProblem,
    canViewDashboard: isOwner,
    canImportOrders: isOwner,
    canImportListings: isOwner,
    canViewImports: isOwner,
    canManageListings: isOwner,
    canManageAccounts: isOwner,
    canManageUsers: isOwner,
    canViewReports: isOwner,
    canResolveProblems: isOwner,
    canViewSystem: isOwner,
    canReviewOldPending: isOwner
  };
}

export function getMobileTabs(role: Role, permissions: MobilePermissionSet): MobileTab[] {
  if (role === "OWNER") {
    return ["dashboard", "work", "imports", "admin", "account"];
  }

  const tabs: MobileTab[] = [];

  if (permissions.canPick) {
    tabs.push("picker");
  }

  if (permissions.canPack) {
    tabs.push("packing");
  }

  if (permissions.canReportProblem || permissions.canViewAssignedProblems) {
    tabs.push("problems");
  }

  tabs.push("account");
  return tabs;
}

export function hasMobilePermission(user: PermissionUser, permission: keyof MobilePermissionSet) {
  return getMobilePermissions(user)[permission];
}
