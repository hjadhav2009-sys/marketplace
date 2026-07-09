export type MobileAccount = {
  id: string;
  companyName: string | null;
  marketplace: string;
  name: string;
  code: string | null;
  active: boolean;
};

export type MobileUser = {
  id: string;
  username: string;
  name: string | null;
  role: "OWNER" | "PICKER" | "PACKER";
  mustChangePassword: boolean;
  permissions: MobilePermissionSet;
  tabs: MobileTab[];
  selectedAccount: MobileAccount | null;
  accounts: MobileAccount[];
};

export type MobileTab = "dashboard" | "work" | "picker" | "packing" | "problems" | "imports" | "reports" | "admin" | "account";

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
  awb: string | null;
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

export type MobileProductDetails = {
  sku: string;
  title: string | null;
  brand: string | null;
  category: string | null;
  fsn: string | null;
  listingId: string | null;
  color: string | null;
  size: string | null;
  mrp: string | number | null;
  sellingPrice: string | number | null;
  rating: string | number | null;
  reviewCount: string | number | null;
  highlights: string | null;
  description: string | null;
  specifications: string | null;
  mainImageUrl: string | null;
  gallery: string[];
  cacheStatus: string | null;
  imageHealth: string | null;
};

export type MobileOwnerImportJob = {
  id: string;
  marketplace: string;
  importType: string;
  fileName: string;
  status: string;
  totalRows: number;
  processedRows: number;
  createdRows: number;
  updatedRows: number;
  duplicateRows: number;
  warningRows: number;
  errorRows: number;
  missingListingRows: number;
  missingImageRows: number;
  createdAt: string;
  updatedAt: string;
};

export type MobileProblemRow = {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  reporter: string | null;
  order: {
    id: string;
    marketplace: string;
    sku: string;
    qty: number;
    color: string | null;
    size: string | null;
    packStatus: string;
    pickStatus: string;
    trackingId: string | null;
    awb: string | null;
    title: string | null;
    mainImageUrl: string | null;
  };
};

export type ApiState<T> = {
  loading: boolean;
  error: string | null;
  data: T | null;
};
