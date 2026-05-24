import { prisma } from "./prisma";
import type { RequestMeta } from "./network";

type AuditInput = {
  userId?: string | null;
  accountId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | string | null;
  request?: RequestMeta | null;
};

function stringifyMetadata(metadata: AuditInput["metadata"]) {
  if (!metadata) {
    return null;
  }

  if (typeof metadata === "string") {
    return metadata;
  }

  return JSON.stringify(metadata);
}

export async function recordAuditLog(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      accountId: input.accountId ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      ipAddress: input.request?.ipAddress ?? null,
      userAgent: input.request?.userAgent ?? null,
      metadata: stringifyMetadata(input.metadata)
    }
  });
}
