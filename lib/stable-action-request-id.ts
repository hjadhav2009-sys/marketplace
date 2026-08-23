import "server-only";
import { createHash } from "node:crypto";

type StableRequestPart = Date | number | string | null | undefined;

export function stableActionRequestId(namespace: string, ...parts: StableRequestPart[]) {
  const fingerprint = createHash("sha256")
    .update(parts.map((part) => part instanceof Date ? part.toISOString() : String(part ?? "")).join("\u001f"))
    .digest("hex")
    .slice(0, 48);
  return `${namespace}:${fingerprint}`;
}
