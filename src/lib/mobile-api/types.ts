import type { Marketplace, Role } from "@prisma/client";

export type MobileAccount = {
  id: string;
  companyName: string;
  marketplace: Marketplace;
  name: string;
  code: string;
  active: boolean;
};

export type MobileUser = {
  id: string;
  username: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  permissions: MobilePermissionSet;
  tabs: MobileTab[];
  selectedAccount: MobileAccount | null;
  accounts: MobileAccount[];
};

export type MobileTab = "dashboard" | "picker" | "packing" | "problems" | "imports" | "reports" | "admin" | "account";

export type MobilePermissionSet = {
  canPick: boolean;
  canPack: boolean;
  canReportProblem: boolean;
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

export type MobileApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    mustChangePassword?: boolean;
  };
};

export type MobilePickerGroup = {
  sku: string;
  title: string | null;
  qty: number;
  pendingCount: number;
  pickedCount: number;
  problemCount: number;
  color: string | null;
  size: string | null;
  mainImageUrl: string | null;
  cacheStatus: string | null;
  status: "READY" | "PICKED" | "PROBLEM";
};

export type MobilePackingSearchResult = {
  orderId: string;
  awb: string;
  trackingId: string | null;
  marketplace: string;
  sku: string;
  title: string | null;
  qty: number;
  color: string | null;
  size: string | null;
  courier: string | null;
  packStatus: string;
  canPack: boolean;
  mainImageUrl: string | null;
  cacheStatus: string | null;
};

export type MobileProductImages = {
  sku: string;
  mainImageUrl: string | null;
  gallery: string[];
};
