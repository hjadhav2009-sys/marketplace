const PRIVATE_IPV4_PATTERNS = [
  /^10\./,
  /^127\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./
];

export type SafeServerUrlResult = {
  normalized: string | null;
  kind: "https" | "private-http" | "unsafe-public-http" | "invalid";
};

export function normalizeUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function isPrivateHttpHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host === "::1" || host.endsWith(".local")) {
    return true;
  }

  if (PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(host))) {
    return true;
  }

  const parts = host.split(".").map(Number);
  return parts.length === 4 && parts.every(Number.isFinite) && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

export function inspectServerUrl(value: string): SafeServerUrlResult {
  const normalized = normalizeUrl(value);

  try {
    const url = new URL(normalized);

    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return { normalized: null, kind: "invalid" };
    }

    if (url.protocol === "https:") {
      return { normalized, kind: "https" };
    }

    return {
      normalized,
      kind: isPrivateHttpHost(url.hostname) ? "private-http" : "unsafe-public-http"
    };
  } catch {
    return { normalized: null, kind: "invalid" };
  }
}

export function isSafeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "mailto:" || url.protocol === "tel:";
  } catch {
    return false;
  }
}

export function isSafeUpdateUrl(value: string, serverUrl: string) {
  try {
    const updateUrl = new URL(value);
    const server = new URL(serverUrl);
    return updateUrl.protocol === "https:" || (updateUrl.origin === server.origin && isPrivateHttpHost(updateUrl.hostname));
  } catch {
    return false;
  }
}
