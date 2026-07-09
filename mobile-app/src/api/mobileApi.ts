import { apiRequest, MobileApiError } from "./client";
import { getSessionCookie } from "../storage/sessionStorage";
import { getServerUrl } from "../storage/serverStorage";
import type {
  MobilePackingSearchResult,
  MobilePickerGroup,
  MobileProductDetails,
  MobileProductImages,
  MobileProblemRow,
  MobileOwnerImportJob,
  MobileUser
} from "../types/mobile";

export async function testConnection() {
  const baseUrl = await getServerUrl();

  if (!baseUrl) {
    throw new MobileApiError("Server URL is not saved.", "missing_server_url", 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const cookie = await getSessionCookie();
    const response = await fetch(`${baseUrl}/api/mobile/sync/status`, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(cookie ? { Cookie: cookie } : {})
      },
      signal: controller.signal
    });

    if (response.ok || response.status === 401) {
      return { ok: true as const, authenticated: response.ok };
    }

    throw new MobileApiError("API responded but is not healthy.", "api_error", response.status);
  } catch (error) {
    if (error instanceof MobileApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new MobileApiError("Server timed out. Check URL and network.", "timeout", 408);
    }

    throw new MobileApiError("Server not reachable. Check URL and network.", "network_error", 0);
  } finally {
    clearTimeout(timeout);
  }
}

export function login(username: string, password: string) {
  return apiRequest<{ ok: true; mustChangePassword: boolean; user: MobileUser }>("/api/mobile/auth/login", {
    method: "POST",
    body: { username, password }
  });
}

export function changePassword(input: { currentPassword: string; newPassword: string; confirmPassword: string }) {
  return apiRequest<{ ok: true; user: MobileUser }>("/api/mobile/auth/change-password", {
    method: "POST",
    body: input
  });
}

export function logout() {
  return apiRequest<{ ok: true }>("/api/mobile/auth/logout", { method: "POST" });
}

export function getMe() {
  return apiRequest<{ ok: true; user: MobileUser }>("/api/mobile/me");
}

export function selectMobileAccount(accountId: string) {
  return apiRequest<{ ok: true; accountId: string; user: MobileUser }>("/api/mobile/accounts/select", {
    method: "POST",
    body: { accountId }
  });
}

export function getOwnerDashboard() {
  return apiRequest<{
    ok: true;
    account: { id: string; companyName: string | null; marketplace: string; name: string; code: string | null };
    stats: { todayReady: number; packedToday: number; problemsOpen: number; oldPending: number };
    latestImports: {
      listing: { id: string; status: string; updatedAt: string; totalRows: number | null } | null;
      orders: { id: string; status: string; updatedAt: string; totalRows: number | null } | null;
    };
  }>("/api/mobile/owner/dashboard");
}

export function getOwnerImports(page = 1, pageSize = 10) {
  return apiRequest<{ ok: true; page: number; pageSize: number; total: number; jobs: MobileOwnerImportJob[] }>(
    `/api/mobile/owner/imports?page=${page}&pageSize=${pageSize}`
  );
}

export function getOwnerListingsSummary() {
  return apiRequest<{
    ok: true;
    totalListings: number;
    activeListings: number;
    missingImageCount: number;
    latestListingImport: { id: string; status: string; updatedAt: string; totalRows: number | null } | null;
    recentListings: Array<{ id: string; sku: string; productTitle: string | null; listingStatus: string | null; mainImageUrl: string | null; updatedAt: string }>;
  }>("/api/mobile/owner/listings/summary");
}

export function getOwnerReportsSummary() {
  return apiRequest<{
    ok: true;
    summary: {
      totalOrders: number;
      todayReady: number;
      todayPicked: number;
      todayPacked: number;
      openProblems: number;
      oldPending: number;
      missingListingCurrent: number;
      missingImageCurrent: number;
    };
    skuSummary: Array<{ sku: string; orders: number; qty: number }>;
    courierSummary: Array<{ courier: string; orders: number; qty: number }>;
  }>("/api/mobile/owner/reports/summary");
}

export function getOwnerAccounts() {
  return apiRequest<{
    ok: true;
    accounts: Array<{
      id: string;
      companyName: string;
      marketplace: string;
      name: string;
      code: string;
      active: boolean;
      users: number;
      orders: number;
      listings: number;
      imports: number;
    }>;
  }>("/api/mobile/owner/accounts");
}

export function getOwnerUsers() {
  return apiRequest<{
    ok: true;
    users: Array<{
      id: string;
      username: string;
      name: string;
      role: string;
      active: boolean;
      canPick: boolean;
      canPack: boolean;
      canReportProblem: boolean;
      mustChangePassword: boolean;
      lastLoginAt: string | null;
      openPasswordResetRequests: number;
      assignedAccounts: Array<{ id: string; companyName: string; marketplace: string; name: string }>;
    }>;
  }>("/api/mobile/owner/users");
}

export function getOwnerSystem() {
  return apiRequest<{
    ok: true;
    app: { name: string; mode: string; mobileApi: string };
    counts: { activeAccounts: number; activeUsers: number; openProblems: number };
    recentImport: { id: string; status: string; importType: string; marketplace: string; updatedAt: string } | null;
    notes: string[];
  }>("/api/mobile/owner/system");
}

export function getOwnerOldPending() {
  return apiRequest<{
    ok: true;
    total: number;
    statusGroups: Array<{ status: string; count: number }>;
    orders: Array<{
      id: string;
      marketplace: string;
      sku: string;
      qty: number;
      trackingId: string | null;
      awb: string | null;
      packStatus: string;
      pickStatus: string;
      oldPendingReviewStatus: string;
      importedAt: string;
    }>;
  }>("/api/mobile/owner/old-pending");
}

export function getProblems(status: "OPEN" | "RESOLVED" = "OPEN") {
  return apiRequest<{ ok: true; status: string; problems: MobileProblemRow[] }>(`/api/mobile/problems?status=${status}`);
}

export function getPickerGroups(accountId?: string) {
  const query = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
  return apiRequest<{ ok: true; groups: MobilePickerGroup[] }>(`/api/mobile/picker/groups${query}`);
}

export function markPicked(input: { sku: string; color?: string | null; size?: string | null; accountId?: string }) {
  return apiRequest<{ ok: true; updatedRows: number }>("/api/mobile/picker/mark-picked", {
    method: "POST",
    body: input
  });
}

export function markPickerProblem(input: {
  sku: string;
  color?: string | null;
  size?: string | null;
  reason: string;
  details?: string;
  accountId?: string;
}) {
  return apiRequest<{ ok: true; affectedOrders: number; createdProblems: number }>("/api/mobile/picker/problem", {
    method: "POST",
    body: input
  });
}

export function searchPacking(code: string, accountId?: string) {
  const params = new URLSearchParams({ code });

  if (accountId) {
    params.set("accountId", accountId);
  }

  return apiRequest<{ ok: true; code: string; matchMode: string; results: MobilePackingSearchResult[] }>(
    `/api/mobile/packing/search?${params.toString()}`
  );
}

export function confirmPacking(input: { code?: string; orderId?: string; accountId?: string }) {
  return apiRequest<{ ok: true; packedCount: number; skippedCount: number; scopedCount: number }>(
    "/api/mobile/packing/confirm",
    {
      method: "POST",
      body: input
    }
  );
}

export function markPackingProblem(input: { code?: string; orderId?: string; reason: string; details?: string; accountId?: string }) {
  return apiRequest<{ ok: true; existing: boolean; problemId: string }>("/api/mobile/packing/problem", {
    method: "POST",
    body: input
  });
}

export function getProductImages(sku: string) {
  return apiRequest<{ ok: true; images: MobileProductImages }>(`/api/mobile/products/${encodeURIComponent(sku)}/images`);
}

export function getProductDetails(sku: string) {
  return apiRequest<{ ok: true; product: MobileProductDetails }>(`/api/mobile/products/${encodeURIComponent(sku)}/details`);
}
