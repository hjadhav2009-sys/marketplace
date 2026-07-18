import { Prisma, type MarketplaceListing, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncMarketplaceListingIdentifiersInTransaction } from "@/src/lib/marking/identifiers";
import { assertWorkerAccountAccess } from "@/src/lib/workflow/worker-access";
import { withWorkflowActionRequestGate } from "@/src/lib/workflow/workflow-action-receipt";
import { MANUAL_LOCKABLE_CATALOG_FIELDS, type ManualLockableCatalogField } from "./manual-listing-fields";

export type ManualListingCommonInput = {
  productTitle?: unknown;
  brand?: unknown;
  category?: unknown;
  subCategory?: unknown;
  fsn?: unknown;
  listingId?: unknown;
  listingStatus?: unknown;
  mrp?: unknown;
  sellingPrice?: unknown;
  mainImageUrl?: unknown;
  description?: unknown;
};

export type ManualListingResult = {
  listingId: string;
  updatedAt: string;
  idempotent: boolean;
};

type CreateManualListingInput = {
  actorUserId: string;
  accountId: string;
  clientRequestId: string;
  sellerSku: unknown;
  common: ManualListingCommonInput;
  manualLocked?: boolean;
};

type UpdateManualListingInput = CreateManualListingInput & {
  marketplaceListingId: string;
  expectedUpdatedAt: string;
};

type UpdateManualListingLocksInput = {
  actorUserId: string;
  accountId: string;
  clientRequestId: string;
  marketplaceListingId: string;
  expectedUpdatedAt: string;
  lockedFields: unknown;
};

type ManualListingData = Pick<MarketplaceListing,
  "productTitle" | "liveBrand" | "liveCategory" | "subCategory" | "fsn" |
  "listingId" | "listingStatus" | "mrp" | "sellingPrice" | "mainImageUrl" |
  "description" | "fieldProvenanceJson" | "manualLocksJson"
>;

const SINGLE_LINE_CONTROL = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069\ufffe\uffff]/i;
const MULTI_LINE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069\ufffe\uffff]/i;
const PRIVATE_PATH = /(?:^|\s)(?:[a-z]:[\\/]|\\\\[^\\]|file:\/\/)/i;
const EXECUTABLE_MARKUP = /<\s*script\b|javascript\s*:/i;
const MANAGED_FIELDS = [
  "productTitle", "liveBrand", "liveCategory", "subCategory", "fsn", "listingId",
  "listingStatus", "mrp", "sellingPrice", "mainImageUrl", "description"
] as const;

function boundedId(value: unknown, label: string, max = 160) {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const result = value.normalize("NFKC").trim();
  if (!result || result.length > max || SINGLE_LINE_CONTROL.test(result)) throw new Error(`${label} is invalid or too long.`);
  return result;
}

function optionalText(value: unknown, label: string, max: number, multiline = false) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`${label} must be plain text.`);
  const normalized = String(value).normalize("NFKC").replace(/\r\n?/g, "\n");
  const result = multiline
    ? normalized.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
    : normalized.replace(/\s+/g, " ").trim();
  if (!result) return null;
  if (result.length > max) throw new Error(`${label} is too long.`);
  if ((multiline ? MULTI_LINE_CONTROL : SINGLE_LINE_CONTROL).test(result)) throw new Error(`${label} contains unsupported control characters.`);
  if (PRIVATE_PATH.test(result)) throw new Error(`${label} must not contain a private filesystem path.`);
  if (EXECUTABLE_MARKUP.test(result)) throw new Error(`${label} contains unsupported executable markup.`);
  return result;
}

function optionalPrice(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  if ((typeof value !== "string" && typeof value !== "number") || (typeof value === "string" && value.trim() === "")) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) throw new Error(`${label} must be a valid non-negative number.`);
  return parsed;
}

function optionalHttpUrl(value: unknown) {
  const result = optionalText(value, "Main image URL", 2048);
  if (!result) return null;
  let parsed: URL;
  try { parsed = new URL(result); } catch { throw new Error("Main image URL must be a valid HTTP or HTTPS URL."); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Main image URL must use HTTP or HTTPS.");
  return result;
}

function canonicalSellerSku(value: unknown) {
  const normalized = optionalText(value, "Seller SKU", 160);
  if (!normalized) throw new Error("Seller SKU is required.");
  return normalized;
}

function manualData(common: ManualListingCommonInput, manualLocked: boolean): ManualListingData {
  const values = {
    productTitle: optionalText(common.productTitle, "Title", 500),
    liveBrand: optionalText(common.brand, "Brand", 240),
    liveCategory: optionalText(common.category, "Category", 240),
    subCategory: optionalText(common.subCategory, "Sub-category", 240),
    fsn: optionalText(common.fsn, "FSN / ASIN", 160),
    listingId: optionalText(common.listingId, "Listing identifier", 160),
    listingStatus: optionalText(common.listingStatus, "Listing status", 80) ?? "NEEDS_ENRICHMENT",
    mrp: optionalPrice(common.mrp, "MRP"),
    sellingPrice: optionalPrice(common.sellingPrice, "Selling price"),
    mainImageUrl: optionalHttpUrl(common.mainImageUrl),
    description: optionalText(common.description, "Description", 12_000, true)
  };
  const entered = MANAGED_FIELDS.filter((field) => values[field] !== null);
  const updatedAt = new Date().toISOString();
  const stamp = { sourceProfile: "MANUAL_OWNER", authority: manualLocked ? 500 : 0, importedAt: updatedAt, sourceAuthority: "MANUAL_OWNER", updatedAt };
  return {
    ...values,
    fieldProvenanceJson: JSON.stringify(Object.fromEntries(entered.map((field) => [field, stamp]))),
    manualLocksJson: JSON.stringify(Object.fromEntries((manualLocked ? entered : []).map((field) => [field, true])))
  };
}

async function authorizeOwner(client: PrismaClient | Prisma.TransactionClient, actorUserId: string, accountId: string) {
  const access = await assertWorkerAccountAccess(actorUserId, accountId, client);
  if (access.user.role !== "OWNER") throw new Error("Owner permission is required to manage Product Inventory.");
  const account = await client.account.findFirst({ where: { id: accountId, active: true }, select: { id: true, marketplace: true } });
  if (!account) throw new Error("Selected account is unavailable.");
  return { user: access.user, account };
}

function parsedObject(value: string | null) {
  try {
    const parsed = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

function parsedLocks(value: string | null) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    if (Array.isArray(parsed)) return new Set(parsed.filter((item): item is string => typeof item === "string"));
    if (parsed && typeof parsed === "object") return new Set(Object.entries(parsed).flatMap(([key, locked]) => locked === true ? [key] : []));
  } catch {}
  return new Set<string>();
}

function mergeManualMetadata(existing: MarketplaceListing, data: ManualListingData): ManualListingData {
  const provenance = parsedObject(existing.fieldProvenanceJson);
  const submittedProvenance = parsedObject(data.fieldProvenanceJson);
  const locks = parsedLocks(existing.manualLocksJson);
  const submittedLocks = parsedLocks(data.manualLocksJson);
  for (const field of MANAGED_FIELDS) {
    if (data[field] === null) delete provenance[field];
    else provenance[field] = submittedProvenance[field];
    locks.delete(field);
    if (submittedLocks.has(field)) locks.add(field);
  }
  return { ...data, fieldProvenanceJson: JSON.stringify(provenance), manualLocksJson: JSON.stringify(Object.fromEntries([...locks].sort().map((field) => [field, true]))) };
}

function sameManualPayload(listing: MarketplaceListing, sellerSku: string, data: ManualListingData) {
  if (listing.sellerSkuId !== sellerSku || listing.sku !== sellerSku) return false;
  if (!MANAGED_FIELDS.every((field) => listing[field] === data[field])) return false;
  const existingLocks = parsedLocks(listing.manualLocksJson);
  const submittedLocks = parsedLocks(data.manualLocksJson);
  const provenance = parsedObject(listing.fieldProvenanceJson);
  return MANAGED_FIELDS.every((field) => existingLocks.has(field) === submittedLocks.has(field)
    && (data[field] === null || (provenance[field] as { sourceAuthority?: unknown } | undefined)?.sourceAuthority === "MANUAL_OWNER"));
}

function transactionConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof Prisma.PrismaClientKnownRequestError && ["P1008", "P2028", "P2034"].includes(error.code)
    || /database is locked|write conflict|transaction.*(?:closed|conflict|timeout)/i.test(message);
}

function uniqueTargetMatches(error: unknown, fields: readonly string[], namedConstraint: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.length === fields.length && target.every((field, index) => field === fields[index]);
  return target === namedConstraint;
}

function sellerSkuUniqueConflict(error: unknown) {
  return uniqueTargetMatches(
    error,
    ["accountId", "marketplace", "sellerSkuId"],
    "MarketplaceListing_accountId_marketplace_sellerSkuId_key"
  );
}

function identifierRegistryUniqueConflict(error: unknown) {
  return uniqueTargetMatches(
    error,
    ["marketplaceListingId", "identifierType", "normalizedValue"],
    "MarketplaceListingIdentifier_marketplaceListingId_identifierType_normalizedValue_key"
  );
}

function controlledIdentifierConflict(error: unknown): never {
  if (identifierRegistryUniqueConflict(error)) throw new Error("Listing identifiers changed concurrently. Refresh and retry the action.");
  throw error;
}

async function serializable<T>(client: PrismaClient, action: (tx: Prisma.TransactionClient) => Promise<T>) {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await client.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      last = error;
      if (!transactionConflict(error)) throw error;
      if (attempt === 3) throw new Error("Catalog work is busy; retry the action.");
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
  throw last;
}

function result(listing: Pick<MarketplaceListing, "id" | "updatedAt">, idempotent: boolean): ManualListingResult {
  return { listingId: listing.id, updatedAt: listing.updatedAt.toISOString(), idempotent };
}

function expectedVersion(value: unknown) {
  const expectedText = boundedId(value, "Expected listing version", 64);
  const expectedUpdatedAt = new Date(expectedText);
  if (Number.isNaN(expectedUpdatedAt.getTime())) throw new Error("Expected listing version is invalid.");
  return expectedUpdatedAt;
}

export async function createManualMarketplaceListing(input: CreateManualListingInput, client: PrismaClient = prisma) {
  const actorUserId = boundedId(input.actorUserId, "Actor user ID");
  const accountId = boundedId(input.accountId, "Account ID");
  const clientRequestId = boundedId(input.clientRequestId, "Client request ID");
  const sellerSku = canonicalSellerSku(input.sellerSku);
  const data = manualData(input.common ?? {}, input.manualLocked !== false);
  const initialAccess = await authorizeOwner(client, actorUserId, accountId);
  const gateKey = [accountId, initialAccess.account.marketplace, "MANUAL_LISTING_CREATE", sellerSku].join(":");

  return withWorkflowActionRequestGate(gateKey, async () => {
    try {
      return await serializable(client, async (tx) => {
        const { user, account } = await authorizeOwner(tx, actorUserId, accountId);
        const existing = await tx.marketplaceListing.findFirst({ where: { accountId, marketplace: account.marketplace, sellerSkuId: sellerSku } });
        if (existing) {
          if (!sameManualPayload(existing, sellerSku, data)) throw new Error("This Seller SKU already exists with different catalog values in the selected account.");
          await syncMarketplaceListingIdentifiersInTransaction(tx, { listing: existing, source: "MANUAL_OWNER" });
          return result(existing, true);
        }
        const listing = await tx.marketplaceListing.create({ data: {
          accountId,
          marketplace: account.marketplace,
          sellerSkuId: sellerSku,
          sku: sellerSku,
          ...data
        } });
        await syncMarketplaceListingIdentifiersInTransaction(tx, { listing, source: "MANUAL_OWNER" });
        await tx.auditLog.create({ data: {
          userId: user.id,
          accountId,
          action: "MANUAL_LISTING_CREATED",
          entityType: "MarketplaceListing",
          entityId: listing.id,
          metadata: JSON.stringify({ marketplace: account.marketplace, clientRequestId })
        } });
        return result(listing, false);
      });
    } catch (error) {
      if (!sellerSkuUniqueConflict(error)) controlledIdentifierConflict(error);
      try {
        return await serializable(client, async (tx) => {
          const { account } = await authorizeOwner(tx, actorUserId, accountId);
          const existing = await tx.marketplaceListing.findFirst({ where: { accountId, marketplace: account.marketplace, sellerSkuId: sellerSku } });
          if (!existing) throw error;
          if (!sameManualPayload(existing, sellerSku, data)) throw new Error("This Seller SKU already exists with different catalog values in the selected account.");
          await syncMarketplaceListingIdentifiersInTransaction(tx, { listing: existing, source: "MANUAL_OWNER" });
          return result(existing, true);
        });
      } catch (recoveryError) {
        controlledIdentifierConflict(recoveryError);
      }
    }
  });
}

export async function updateManualMarketplaceListing(input: UpdateManualListingInput, client: PrismaClient = prisma) {
  const actorUserId = boundedId(input.actorUserId, "Actor user ID");
  const accountId = boundedId(input.accountId, "Account ID");
  const clientRequestId = boundedId(input.clientRequestId, "Client request ID");
  const marketplaceListingId = boundedId(input.marketplaceListingId, "Marketplace listing ID");
  const sellerSku = canonicalSellerSku(input.sellerSku);
  const expectedUpdatedAt = expectedVersion(input.expectedUpdatedAt);
  const data = manualData(input.common ?? {}, input.manualLocked !== false);
  await authorizeOwner(client, actorUserId, accountId);

  return withWorkflowActionRequestGate([accountId, "MANUAL_LISTING_UPDATE", marketplaceListingId].join(":"), async () => {
    try {
      return await serializable(client, async (tx) => {
        const { user, account } = await authorizeOwner(tx, actorUserId, accountId);
        const existing = await tx.marketplaceListing.findFirst({ where: { id: marketplaceListingId, accountId, marketplace: account.marketplace } });
        if (!existing) throw new Error("Listing is unavailable.");
        if (existing.sellerSkuId !== sellerSku) throw new Error("Seller SKU cannot be changed through Product Inventory editing.");
        if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw new Error("This listing changed in another tab. Refresh before saving again.");
        const nextUpdatedAt = new Date(Math.max(Date.now(), expectedUpdatedAt.getTime() + 1));
        const updateData = mergeManualMetadata(existing, data);
        const changed = await tx.marketplaceListing.updateMany({
          where: { id: existing.id, accountId, marketplace: account.marketplace, updatedAt: expectedUpdatedAt },
          data: {
            ...updateData,
            imageCacheStaleAt: existing.mainImageUrl !== data.mainImageUrl ? nextUpdatedAt : existing.imageCacheStaleAt,
            updatedAt: nextUpdatedAt
          }
        });
        if (changed.count !== 1) throw new Error("This listing changed in another tab. Refresh before saving again.");
        const listing = await tx.marketplaceListing.findUniqueOrThrow({ where: { id: existing.id } });
        await syncMarketplaceListingIdentifiersInTransaction(tx, { listing, source: "MANUAL_OWNER" });
        await tx.auditLog.create({ data: {
          userId: user.id,
          accountId,
          action: "MANUAL_LISTING_UPDATED",
          entityType: "MarketplaceListing",
          entityId: listing.id,
          metadata: JSON.stringify({ marketplace: account.marketplace, clientRequestId })
        } });
        return result(listing, false);
      });
    } catch (error) {
      controlledIdentifierConflict(error);
    }
  });
}

export async function updateManualMarketplaceListingLocks(input: UpdateManualListingLocksInput, client: PrismaClient = prisma) {
  const actorUserId = boundedId(input.actorUserId, "Actor user ID");
  const accountId = boundedId(input.accountId, "Account ID");
  const clientRequestId = boundedId(input.clientRequestId, "Client request ID");
  const marketplaceListingId = boundedId(input.marketplaceListingId, "Marketplace listing ID");
  const expectedUpdatedAt = expectedVersion(input.expectedUpdatedAt);
  if (!Array.isArray(input.lockedFields) || input.lockedFields.length > MANUAL_LOCKABLE_CATALOG_FIELDS.length) throw new Error("Catalog lock selection is invalid.");
  const allowed = new Set<string>(MANUAL_LOCKABLE_CATALOG_FIELDS);
  const selected = input.lockedFields.map((field) => boundedId(field, "Catalog lock field", 80));
  if (new Set(selected).size !== selected.length || selected.some((field) => !allowed.has(field))) throw new Error("Catalog lock selection contains an unsupported field.");
  await authorizeOwner(client, actorUserId, accountId);

  return withWorkflowActionRequestGate([accountId, "MANUAL_LISTING_LOCKS", marketplaceListingId].join(":"), () =>
    serializable(client, async (tx) => {
      const { user, account } = await authorizeOwner(tx, actorUserId, accountId);
      const existing = await tx.marketplaceListing.findFirst({ where: { id: marketplaceListingId, accountId, marketplace: account.marketplace } });
      if (!existing) throw new Error("Listing is unavailable.");
      if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw new Error("This listing changed in another tab. Refresh before saving field locks.");
      const locks = parsedLocks(existing.manualLocksJson);
      for (const field of MANUAL_LOCKABLE_CATALOG_FIELDS) locks.delete(field);
      for (const field of selected as ManualLockableCatalogField[]) locks.add(field);
      const nextUpdatedAt = new Date(Math.max(Date.now(), expectedUpdatedAt.getTime() + 1));
      const changed = await tx.marketplaceListing.updateMany({
        where: { id: existing.id, accountId, marketplace: account.marketplace, updatedAt: expectedUpdatedAt },
        data: { manualLocksJson: JSON.stringify(Object.fromEntries([...locks].sort().map((field) => [field, true]))), updatedAt: nextUpdatedAt }
      });
      if (changed.count !== 1) throw new Error("This listing changed in another tab. Refresh before saving field locks.");
      const listing = await tx.marketplaceListing.findUniqueOrThrow({ where: { id: existing.id } });
      await tx.auditLog.create({ data: {
        userId: user.id,
        accountId,
        action: "CATALOG_FIELD_LOCKS_UPDATED",
        entityType: "MarketplaceListing",
        entityId: listing.id,
        metadata: JSON.stringify({ lockedFields: selected.sort(), clientRequestId })
      } });
      return result(listing, false);
    })
  );
}
