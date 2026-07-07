import { apiRequest, MobileApiError } from "./client";
import { getSessionCookie } from "../storage/sessionStorage";
import { getServerUrl } from "../storage/serverStorage";
import type {
  MobilePackingSearchResult,
  MobilePickerGroup,
  MobileProductDetails,
  MobileProductImages,
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

export function logout() {
  return apiRequest<{ ok: true }>("/api/mobile/auth/logout", { method: "POST" });
}

export function getMe() {
  return apiRequest<{ ok: true; user: MobileUser }>("/api/mobile/me");
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
