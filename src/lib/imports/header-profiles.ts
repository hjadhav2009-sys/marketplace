import { createHash } from "node:crypto";
import type { Marketplace, MarketplaceFileProfile, MarketplaceImportPurpose, Prisma, PrismaClient, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertWorkerAccountAccess } from "@/src/lib/workflow/worker-access";

type Client = PrismaClient | Prisma.TransactionClient;
export type CanonicalFieldMapping = Record<string, string>;

export function normalizeMarketplaceHeader(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase().replace(/[\s_.\-/\\]+/g, " ").replace(/[^\p{L}\p{N}#\[\] ]/gu, "").replace(/\s+/g, " ");
}

export function headerFingerprint(headers: unknown[]) {
  const normalized = headers.map(normalizeMarketplaceHeader).filter(Boolean);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function detectHeaderBand(rows: unknown[][], requiredSignatures: Array<string | RegExp>, limit = 80) {
  for (let index = 0; index < Math.min(rows.length, limit); index += 1) {
    const normalized = rows[index].map(normalizeMarketplaceHeader);
    const matches = requiredSignatures.every((signature) => normalized.some((header) => typeof signature === "string" ? header === normalizeMarketplaceHeader(signature) : signature.test(header)));
    if (matches) return { rowIndex: index, originalHeaders: rows[index].map((value) => String(value ?? "")), normalizedHeaders: normalized, fingerprint: headerFingerprint(rows[index]) };
  }
  return null;
}

export const AMAZON_TECHNICAL_SIGNATURES = [/^contribution sku#1 value$/, /^product type#1 value$/, /^item name\[.*\]#1 value$/, /^main product image locator\[.*\]#1 media location$/];
export const AMAZON_CONSIGNMENT_SIGNATURES = ["Merchant SKU", "ASIN", "FNSKU", "Shipped"];
export const FLIPKART_CONSIGNMENT_SIGNATURES = ["Product Name", "FSN", "SKU Id", "Quantity Sent"];
export const FLIPKART_ORDER_SIGNATURES = ["ORDER ITEM ID", "Order Id", "SKU", "Quantity", "Tracking ID"];

export function profileMapping(profile: Pick<MarketplaceFileProfile, "fieldMappingJson">): CanonicalFieldMapping {
  const parsed = JSON.parse(profile.fieldMappingJson) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Saved field mapping is invalid.");
  return parsed as CanonicalFieldMapping;
}

export async function findHeaderProfile(input: { accountId?: string; marketplace: Marketplace; importPurpose: MarketplaceImportPurpose; headers: unknown[] }, client: Client = prisma) {
  const fingerprint = headerFingerprint(input.headers);
  const profile = await client.marketplaceFileProfile.findFirst({ where: { marketplace: input.marketplace, importPurpose: input.importPurpose, headerFingerprint: fingerprint, active: true, OR: [{ accountId: input.accountId ?? null }, { accountId: null }] }, orderBy: [{ accountId: "desc" }, { version: "desc" }] });
  return profile ? { state: "MATCHED" as const, profile, mapping: profileMapping(profile), fingerprint } : { state: "NEEDS_MAPPING" as const, profile: null, mapping: null, fingerprint };
}

function canManageProfiles(user: Pick<User, "role" | "canImportConsignments">) { return user.role === "OWNER" || user.canImportConsignments; }

export async function saveHeaderProfile(input: { actorUserId: string; accountId: string; marketplace: Marketplace; importPurpose: MarketplaceImportPurpose; profileName: string; headers: string[]; mapping: CanonicalFieldMapping; requiredFields: string[]; optionalFields?: string[]; dataSheetRule?: Record<string, unknown>; dataStartRule?: Record<string, unknown> }, client: PrismaClient = prisma) {
  return client.$transaction(async (tx) => {
    const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
    if (!canManageProfiles(user)) throw new Error("Import profile management permission is required.");
    const fingerprint = headerFingerprint(input.headers); const mapped = new Set(Object.keys(input.mapping));
    if (!input.profileName.trim() || !input.requiredFields.every((field) => mapped.has(field))) throw new Error("Map every required canonical field before saving.");
    const latest = await tx.marketplaceFileProfile.findFirst({ where: { marketplace: input.marketplace, importPurpose: input.importPurpose, headerFingerprint: fingerprint }, orderBy: { version: "desc" } });
    const profile = await tx.marketplaceFileProfile.create({ data: { accountId: input.accountId, marketplace: input.marketplace, importPurpose: input.importPurpose, profileName: input.profileName.normalize("NFKC").trim().slice(0, 160), headerFingerprint: fingerprint, fieldMappingJson: JSON.stringify(input.mapping), requiredFieldsJson: JSON.stringify(input.requiredFields), optionalFieldsJson: JSON.stringify(input.optionalFields ?? []), dataSheetRuleJson: input.dataSheetRule ? JSON.stringify(input.dataSheetRule) : null, dataStartRuleJson: input.dataStartRule ? JSON.stringify(input.dataStartRule) : null, version: (latest?.version ?? 0) + 1, active: true, createdByUserId: user.id } });
    await tx.auditLog.create({ data: { userId: user.id, accountId: input.accountId, action: latest ? "MARKETPLACE_FILE_PROFILE_UPDATED" : "MARKETPLACE_FILE_PROFILE_CREATED", entityType: "MarketplaceFileProfile", entityId: profile.id, metadata: JSON.stringify({ marketplace: input.marketplace, importPurpose: input.importPurpose, fingerprint, version: profile.version }) } });
    return profile;
  });
}
