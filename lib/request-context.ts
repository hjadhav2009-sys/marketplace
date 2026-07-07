import { headers } from "next/headers";
import { getSafeClientIp, shouldTrustProxyHeaders, type RequestMeta } from "./network";

export async function getRequestMeta(): Promise<RequestMeta> {
  const headerStore = await headers();

  return {
    ipAddress: getSafeClientIp(headerStore, { trustProxyHeaders: shouldTrustProxyHeaders() }),
    userAgent: headerStore.get("user-agent") ?? undefined
  };
}
