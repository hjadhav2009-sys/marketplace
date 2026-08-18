import { hasWorkPermission } from "@/lib/work-permissions";
import type { AppNavLink } from "@/components/appNavigation";

export type NavigationUser = {
  role: "OWNER" | "PICKER" | "PACKER";
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
};

export const ownerNavigation: readonly AppNavLink[] = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", section: "OVERVIEW", icon: "overview" },
  { id: "work-hub", href: "/work", label: "Work Hub", section: "WORK", icon: "work" },
  { id: "pick", href: "/work/pick", label: "Pick", section: "WORK", icon: "pick" },
  { id: "mark", href: "/work/mark", label: "Mark", section: "WORK", icon: "mark", ownedPaths: ["/work/marking"] },
  { id: "assemble", href: "/work/assemble", label: "Assemble", section: "WORK", icon: "assemble", ownedPaths: ["/work/assembly"] },
  { id: "pack", href: "/work/pack", label: "Pack", section: "WORK", icon: "pack" },
  { id: "scan", href: "/work/scan", label: "Universal Scan", section: "WORK", icon: "scan" },
  { id: "problems", href: "/work/problems", label: "Problems", section: "WORK", icon: "problem" },
  { id: "route-summary", href: "/owner/work-route-summary", label: "Route Summary", section: "WORK", icon: "insights" },
  { id: "product-inventory", href: "/owner/product-inventory", label: "Product Inventory", section: "CATALOG", icon: "catalog" },
  { id: "missing-listings", href: "/owner/catalog/missing", label: "Missing Listings", section: "CATALOG", icon: "catalog" },
  { id: "default-processing", href: "/owner/process-rules", label: "Default Processing", section: "CATALOG", icon: "work" },
  { id: "marking-library", href: "/owner/marking-library", label: "Marking Library", section: "CATALOG", icon: "mark" },
  { id: "new-import", href: "/owner/product-inventory/refresh", label: "New Import", section: "IMPORTS", icon: "import" },
  { id: "import-history", href: "/owner/imports", label: "Import History", section: "IMPORTS", icon: "import" },
  { id: "consignments", href: "/owner/consignments", label: "Consignments", section: "IMPORTS", icon: "pack" },
  { id: "accounts", href: "/owner/accounts", label: "Accounts", section: "PEOPLE", icon: "people" },
  { id: "users", href: "/owner/users", label: "Users", section: "PEOPLE", icon: "people" },
  { id: "reports", href: "/reports", label: "Reports", section: "INSIGHTS & SYSTEM", icon: "insights" },
  { id: "system", href: "/owner/system", label: "System", section: "INSIGHTS & SYSTEM", icon: "system" },
  { id: "data-management", href: "/owner/data-management", label: "Data Management", section: "INSIGHTS & SYSTEM", icon: "system" },
  { id: "password", href: "/change-password", label: "Password", section: "PROFILE", icon: "password" },
];

export function navigationForUser(user: NavigationUser): AppNavLink[] {
  if (user.role === "OWNER") return [...ownerNavigation];

  const links: AppNavLink[] = [];
  const hasStageAccess =
    hasWorkPermission(user, "canPick") ||
    hasWorkPermission(user, "canMark") ||
    hasWorkPermission(user, "canAssemble") ||
    hasWorkPermission(user, "canPack") ||
    user.canViewAllWork;

  if (hasStageAccess) {
    links.push(
      { id: "work", href: "/work", label: "Work", section: "WORK", icon: "work" },
      { id: "universal-scan", href: "/work/scan", label: "Universal Scan", section: "WORK", icon: "scan" }
    );
  }
  if (hasWorkPermission(user, "canPick")) {
    links.push({ id: "pick", href: "/work/pick", label: "Pick", section: "WORK", icon: "pick" });
  }
  if (hasWorkPermission(user, "canMark")) {
    links.push({ id: "marking", href: "/work/mark", label: "Marking", section: "WORK", icon: "mark", ownedPaths: ["/work/marking"] });
  }
  if (hasWorkPermission(user, "canAssemble") || user.canViewAllWork) {
    links.push({ id: "assembly", href: "/work/assemble", label: "Assembly", section: "WORK", icon: "assemble", ownedPaths: ["/work/assembly"] });
  }
  if (hasWorkPermission(user, "canPack")) {
    links.push({ id: "pack", href: "/work/pack", label: "Pack", section: "WORK", icon: "pack" });
  }
  if (user.canReportProblem || user.canManageConsignments || user.canViewAllWork) {
    links.push({ id: "work-problems", href: "/work/problems", label: "Work Problems", section: "WORK", icon: "problem" });
  }
  if (
    hasWorkPermission(user, "canViewConsignments") ||
    hasWorkPermission(user, "canImportConsignments") ||
    hasWorkPermission(user, "canManageConsignments")
  ) {
    links.push({ id: "consignments", href: "/owner/consignments", label: "Consignments", section: "MANAGE", icon: "pack" });
  }
  if (hasWorkPermission(user, "canManageMarkingLibrary")) {
    links.push({ id: "marking-library", href: "/owner/marking-library", label: "Marking Library", section: "MANAGE", icon: "mark" });
  }
  if (hasWorkPermission(user, "canManageProcessRules")) {
    links.push({ id: "default-processing", href: "/owner/process-rules", label: "Default Processing", section: "MANAGE", icon: "work" });
  }
  links.push({ id: "password", href: "/change-password", label: "Password", section: "PROFILE", icon: "password" });
  return links;
}
