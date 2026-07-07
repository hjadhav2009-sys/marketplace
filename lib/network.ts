export type RequestMeta = {
  ipAddress?: string;
  userAgent?: string;
};

type HeaderReader = {
  get(name: string): string | null;
};

type ClientIpOptions = {
  directIp?: string | null;
  trustProxyHeaders?: boolean;
};

function ipv4ToNumber(ip: string) {
  const parts = ip.split(".").map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }

  return parts.reduce((value, part) => (value << 8) + part, 0) >>> 0;
}

export function normalizeIp(ip: string | null | undefined) {
  if (!ip) {
    return undefined;
  }

  const firstIp = ip.split(",")[0]?.trim();

  if (!firstIp) {
    return undefined;
  }

  if (firstIp === "::1") {
    return "127.0.0.1";
  }

  if (firstIp.startsWith("::ffff:")) {
    return firstIp.slice("::ffff:".length);
  }

  return firstIp;
}

export function shouldTrustProxyHeaders(env: NodeJS.ProcessEnv = process.env) {
  return env["TRUST_PROXY_HEADERS"] === "true";
}

export function getSafeClientIp(headers: HeaderReader, options: ClientIpOptions = {}) {
  const directIp = normalizeIp(options.directIp);

  if (directIp) {
    return directIp;
  }

  if (!options.trustProxyHeaders) {
    return undefined;
  }

  return normalizeIp(headers.get("x-forwarded-for") ?? headers.get("x-real-ip"));
}

export function isLocalhostIp(ip: string | null | undefined) {
  const normalized = normalizeIp(ip);
  return normalized === "127.0.0.1" || normalized === "localhost";
}

export function isIpInCidr(ip: string, cidr: string) {
  const [range, prefixText] = cidr.trim().split("/");
  const ipNumber = ipv4ToNumber(ip);
  const rangeNumber = ipv4ToNumber(range ?? "");
  const prefix = Number(prefixText);

  if (ipNumber === null || rangeNumber === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipNumber & mask) === (rangeNumber & mask);
}

export function isAllowedLocalNetworkIp(ip: string | null | undefined, ranges: string) {
  const normalized = normalizeIp(ip);

  if (!normalized) {
    return false;
  }

  if (isLocalhostIp(normalized)) {
    return true;
  }

  return ranges
    .split(",")
    .map((range) => range.trim())
    .filter(Boolean)
    .some((range) => isIpInCidr(normalized, range));
}
