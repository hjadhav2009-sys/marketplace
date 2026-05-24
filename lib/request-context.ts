import { headers } from "next/headers";
import { normalizeIp, type RequestMeta } from "./network";

export async function getRequestMeta(): Promise<RequestMeta> {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for");
  const realIp = headerStore.get("x-real-ip");

  return {
    ipAddress: normalizeIp(forwardedFor ?? realIp),
    userAgent: headerStore.get("user-agent") ?? undefined
  };
}
