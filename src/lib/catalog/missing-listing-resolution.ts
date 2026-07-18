import { createHash } from "node:crypto";
import { Prisma, type IdentifierType, type Marketplace, type PrismaClient, type ProcessRoute } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canonicalSkuIdentity } from "@/lib/sku";
import type { DynamicListingField, DynamicListingFormSchema } from "./dynamic-form-profiles";
import { preferredFlipkartGallery } from "./dynamic-form-profiles";
import {
  normalizeListingIdentifier,
  syncMarketplaceListingIdentifiersInTransaction,
  type ListingIdentifierInput
} from "@/src/lib/marking/identifiers";
import { createWorkRouteSnapshot } from "@/src/lib/workflow/dynamic-route";
import { refreshAffectedWorkGroups } from "@/src/lib/workflow/work-group-projection";
import { createImmutableRouteProvenance } from "@/src/lib/workflow/route-provenance";
import { assertWorkerAccountAccess } from "@/src/lib/workflow/worker-access";
import {
  beginWorkflowActionReceipt,
  completeWorkflowActionReceipt,
  withWorkflowActionRequestGate
} from "@/src/lib/workflow/workflow-action-receipt";

type Client = PrismaClient;
type CommonFields = {
  productTitle?: unknown;
  subCategory?: unknown;
  listingStatus?: unknown;
  mrp?: unknown;
  sellingPrice?: unknown;
  liveTitle?: unknown;
  brand?: unknown;
  category?: unknown;
  livePrice?: unknown;
  liveMrp?: unknown;
  productHighlights?: unknown;
  description?: unknown;
  specifications?: unknown;
  generatedProductUrl?: unknown;
  canonicalProductUrl?: unknown;
  images?: unknown[];
};
type DynamicAttributeInput = { technicalKey: string; displayLabel: string; value: unknown; sourceHeader?: string; manualLocked?: boolean };
type IdentifierInput = { type: IdentifierType; value: unknown };

type ProfileBoundInput = {
  profileId?: string;
  expectedProfileTechnicalFingerprint?: string;
};

export type ResolveMissingListingInput = ProfileBoundInput & {
  actorUserId: string;
  accountId: string;
  issueId: string;
  expectedIssueVersion: number;
  clientRequestId: string;
  action: "LINK_EXISTING" | "CREATE_MINIMAL" | "CREATE_FULL";
  listingId?: string;
  common?: CommonFields;
  identifiers?: IdentifierInput[];
  attributes?: DynamicAttributeInput[];
  manualLocked?: boolean;
};

export type ResolveConsignmentMissingListingInput = ProfileBoundInput & {
  actorUserId: string;
  accountId: string;
  batchId: string;
  lineId: string;
  expectedLineUpdatedAt: string;
  clientRequestId: string;
  action: "LINK_EXISTING" | "CREATE_MINIMAL" | "CREATE_FULL";
  listingId?: string;
  common?: CommonFields;
  identifiers?: IdentifierInput[];
  attributes?: DynamicAttributeInput[];
  manualLocked?: boolean;
};

export type ClearConsignmentListingInput = {
  actorUserId: string;
  accountId: string;
  batchId: string;
  lineId: string;
  expectedLineUpdatedAt: string;
  clientRequestId: string;
};

type OrderResolutionResult = { listingId: string; taskId: string | null; idempotent: boolean };
type ConsignmentResolutionResult = { listingId: string; lineId: string; requiredQuantity: number; idempotent: boolean };
type ConsignmentClearResult = { lineId: string; requiredQuantity: number; idempotent: boolean };

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069\ufffe\uffff]/i;
const PRIVATE_PATH = /(?:^|\s)(?:[a-z]:[\\/]|\\\\[^\\]|file:\/\/)/i;
const SCRIPT_MARKUP = /<\s*script\b|javascript\s*:/i;
const ALLOWED_IDENTIFIER_TYPES = new Set<IdentifierType>([
  "SELLER_SKU", "FSN", "LISTING_ID", "LID", "ASIN", "FNSKU", "EAN", "UPC", "GTIN",
  "BARCODE", "MODEL_NUMBER", "INTERNAL_SKU", "EXTERNAL_ID"
]);

const hash = (value: unknown) => {
  let serialized: string;
  try { serialized = JSON.stringify(value); } catch { throw new Error("Catalog request payload is invalid."); }
  if (serialized.length > 256_000) throw new Error("Catalog request payload is too large.");
  return createHash("sha256").update(serialized).digest("hex");
};

function boundedId(value: unknown, label: string, max = 160) {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const result = value.normalize("NFKC").trim();
  if (!result || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) throw new Error(`${label} is invalid or too long.`);
  return result;
}

function optionalText(value: unknown, label: string, max: number, multiline = false) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") throw new Error(`${label} must be a plain scalar value.`);
  const normalized = String(value).normalize("NFKC").replace(/\r\n?/g, "\n");
  const result = multiline
    ? normalized.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
    : normalized.replace(/\s+/g, " ").trim();
  if (!result) return null;
  if (result.length > max) throw new Error(`${label} is too long.`);
  if (CONTROL.test(result)) throw new Error(`${label} contains unsupported control characters.`);
  if (PRIVATE_PATH.test(result)) throw new Error(`${label} must not contain a private filesystem path.`);
  if (SCRIPT_MARKUP.test(result)) throw new Error(`${label} contains unsupported executable markup.`);
  return result;
}

function nonNegativeNumber(value: unknown, label: string) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`${label} must be numeric.`);
  const normalized = typeof value === "string" ? value.normalize("NFKC").trim() : value;
  if (normalized === "") return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) throw new Error(`${label} must be a valid non-negative number.`);
  return parsed;
}

function safeUrl(value: unknown, label = "Image or product URL") {
  const result = optionalText(value, label, 2048);
  if (!result) return null;
  let url: URL;
  try { url = new URL(result); } catch { throw new Error(`${label} must be a valid HTTP or HTTPS URL.`); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`${label} must use HTTP or HTTPS.`);
  if (url.username || url.password) throw new Error(`${label} must not contain embedded credentials.`);
  return result;
}

function safeJson(value: string | null) {
  try {
    const parsed = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

function protectedCandidateIds(safe: Record<string, unknown>) {
  if (safe.listingIds === undefined) return [];
  if (!Array.isArray(safe.listingIds) || safe.listingIds.length > 25) throw new Error("Saved listing candidates are invalid; re-import or repair the issue before resolving it.");
  const ids = safe.listingIds.map((value) => boundedId(value, "Saved listing candidate ID"));
  if (new Set(ids).size !== ids.length) throw new Error("Saved listing candidates are invalid; re-import or repair the issue before resolving it.");
  return ids;
}

function matchingListingIdentifier(
  listing: {
    sellerSkuId: string;
    sku: string;
    fsn: string | null;
    listingId: string | null;
    identifiers: Array<{ identifierType: IdentifierType; normalizedValue: string }>;
  },
  sources: ListingIdentifierInput[]
) {
  const direct: Partial<Record<IdentifierType, Array<string | null>>> = {
    SELLER_SKU: [listing.sellerSkuId],
    INTERNAL_SKU: [listing.sku],
    FSN: [listing.fsn],
    LISTING_ID: [listing.listingId]
  };
  for (const source of sources) {
    const normalized = normalizeListingIdentifier(source.type, source.value);
    if (!normalized) continue;
    if ((direct[source.type] ?? []).some((value) => normalizeListingIdentifier(source.type, value) === normalized)) return { type: source.type, value: normalized };
    if (listing.identifiers.some((identifier) => identifier.identifierType === source.type && identifier.normalizedValue === normalized)) return { type: source.type, value: normalized };
  }
  return null;
}

function commonListingData(common: CommonFields | undefined, manualLocked: boolean) {
  if (common?.images !== undefined && !Array.isArray(common.images)) throw new Error("Images must be submitted as a bounded list.");
  if ((common?.images?.length ?? 0) > 10) throw new Error("At most 10 image URLs may be submitted.");
  const images = (common?.images ?? []).map((value) => safeUrl(value, "Image URL")).filter((value): value is string => Boolean(value));
  const gallery = preferredFlipkartGallery(Object.fromEntries(images.map((value, index) => [`imageUrl${index + 1}`, value])));
  const data = {
    productTitle: optionalText(common?.productTitle, "Title", 500),
    subCategory: optionalText(common?.subCategory, "Sub-category", 240),
    listingStatus: optionalText(common?.listingStatus, "Listing status", 80) ?? "NEEDS_ENRICHMENT",
    mrp: nonNegativeNumber(common?.mrp, "MRP"),
    sellingPrice: nonNegativeNumber(common?.sellingPrice, "Selling price"),
    liveTitle: optionalText(common?.liveTitle, "Live title", 500),
    liveBrand: optionalText(common?.brand, "Brand", 240),
    liveCategory: optionalText(common?.category, "Category", 240),
    livePrice: nonNegativeNumber(common?.livePrice, "Live price"),
    liveMrp: nonNegativeNumber(common?.liveMrp, "Live MRP"),
    productHighlights: optionalText(common?.productHighlights, "Product highlights", 8000, true),
    description: optionalText(common?.description, "Description", 12_000, true),
    allSpecifications: optionalText(common?.specifications, "Specifications", 12_000, true),
    generatedDirectProductUrl: safeUrl(common?.generatedProductUrl, "Generated product URL"),
    canonicalProductUrl: safeUrl(common?.canonicalProductUrl, "Canonical product URL"),
    mainImageUrl: gallery[0] ?? null,
    ...Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`imageUrl${index + 1}`, gallery[index] ?? null]))
  };
  const entered = Object.entries(data).filter(([, value]) => value !== null).map(([key]) => key);
  const updatedAt = new Date().toISOString();
  const stamp = { sourceProfile: "MANUAL_OWNER", authority: manualLocked ? 500 : 0, importedAt: updatedAt, sourceAuthority: "MANUAL_OWNER", updatedAt };
  return {
    ...data,
    fieldProvenanceJson: JSON.stringify(Object.fromEntries(entered.map((key) => [key, stamp]))),
    manualLocksJson: JSON.stringify(Object.fromEntries((manualLocked ? entered : []).map((key) => [key, true])))
  };
}

function validatedIdentifiers(values: IdentifierInput[] | undefined): ListingIdentifierInput[] {
  if (values !== undefined && !Array.isArray(values)) throw new Error("Listing identifiers must be submitted as a bounded list.");
  if ((values?.length ?? 0) > 50) throw new Error("Too many listing identifiers were submitted.");
  return (values ?? []).map((item) => {
    if (!item || typeof item !== "object" || !ALLOWED_IDENTIFIER_TYPES.has(item.type) || item.type === "SELLER_SKU" || item.type === "INTERNAL_SKU") throw new Error("Identifier type is unsupported.");
    if (!normalizeListingIdentifier(item.type, item.value)) throw new Error(`${item.type} is blank, invalid, or too long.`);
    return { type: item.type, value: item.value };
  });
}

function profileFields(schema: DynamicListingFormSchema) {
  if (!Array.isArray(schema.fields) || schema.fields.length > 1000) throw new Error("The selected marketplace template has invalid fields.");
  const result = new Map<string, DynamicListingField>();
  for (const field of schema.fields) {
    if (!field || typeof field !== "object" || !field.dynamicAttributeTarget) continue;
    const key = safeTechnicalKey(field.dynamicAttributeTarget);
    if (result.has(key)) throw new Error("The selected marketplace template contains a duplicate technical key.");
    result.set(key, field);
  }
  return result;
}

function safeTechnicalKey(value: unknown) {
  const key = boundedId(value, "Dynamic attribute key", 1000);
  if (CONTROL.test(key) || PRIVATE_PATH.test(key) || SCRIPT_MARKUP.test(key) || /[<>]/.test(key)) throw new Error("Dynamic attribute key contains unsupported characters.");
  return key;
}

function scalarAttributeValue(attribute: DynamicAttributeInput, field: DynamicListingField) {
  if (!["text", "long_text", "number", "integer", "decimal", "URL", "boolean", "select", "multi_value"].includes(field.dataType)) throw new Error("The selected marketplace template contains an unsupported field type.");
  if (attribute.value === null || attribute.value === undefined || attribute.value === "") return null;
  if (!["string", "number", "boolean"].includes(typeof attribute.value)) throw new Error("Dynamic attribute values must be plain scalar values, not formula or JSON objects.");
  if (typeof attribute.value === "number" && !Number.isFinite(attribute.value)) throw new Error(`${field.label} has an invalid numeric value.`);
  const maxLength = Math.min(Math.max(1, field.maxLength || 4000), 12_000);
  const valueText = optionalText(attribute.value, field.label || field.technicalKey, maxLength, field.dataType === "long_text" || field.dataType === "multi_value");
  if (!valueText) return null;
  if (field.dataType === "URL") safeUrl(valueText, field.label || "Dynamic URL");
  if (["number", "decimal", "integer"].includes(field.dataType)) {
    const parsed = Number(valueText);
    if (!Number.isFinite(parsed) || (field.dataType === "integer" && !Number.isInteger(parsed))) throw new Error(`${field.label} has an invalid numeric value.`);
    const priceLike = /(?:^|[^a-z])(price|mrp|amount|cost)(?:[^a-z]|$)/i.test(`${field.technicalKey} ${field.label}`);
    if (priceLike && parsed < 0) throw new Error(`${field.label} must be a valid non-negative price or amount.`);
  }
  if (field.dataType === "boolean" && !["true", "false", "1", "0"].includes(valueText.toLowerCase())) throw new Error(`${field.label} must be true or false.`);
  const valueJson = JSON.stringify(attribute.value);
  if (typeof valueJson !== "string") throw new Error(`${field.label} has an invalid value.`);
  if (valueJson.length > 16_000) throw new Error(`${field.label} is too large to save.`);
  return { valueText, valueJson };
}

async function writeDynamicAttributes(tx: Prisma.TransactionClient, input: {
  accountId: string;
  marketplace: Marketplace;
  listingId: string;
  actorUserId: string;
  profileId?: string;
  expectedProfileTechnicalFingerprint?: string;
  attributes?: DynamicAttributeInput[];
}) {
  if (input.attributes !== undefined && !Array.isArray(input.attributes)) throw new Error("Dynamic attributes must be submitted as a bounded list.");
  const submitted = input.attributes ?? [];
  if (submitted.length > 250) throw new Error("At most 250 dynamic attributes may be submitted.");
  if (!submitted.some((attribute) => String(attribute.value ?? "").trim())) return 0;
  const profileId = boundedId(input.profileId, "Marketplace template ID");
  const profile = await tx.marketplaceFileProfile.findFirst({ where: {
    id: profileId,
    active: true,
    marketplace: input.marketplace,
    importPurpose: "PRODUCT_CATALOG",
    OR: [{ accountId: input.accountId }, { accountId: null }]
  } });
  if (!profile?.formSchemaJson) throw new Error("The selected marketplace template is unavailable or no longer active.");
  let schema: DynamicListingFormSchema;
  try { schema = JSON.parse(profile.formSchemaJson) as DynamicListingFormSchema; } catch { throw new Error("The selected marketplace template is invalid."); }
  if (schema.marketplace !== input.marketplace) throw new Error("The selected marketplace template does not match this account.");
  const expectedFingerprint = boundedId(input.expectedProfileTechnicalFingerprint, "Marketplace template fingerprint", 128);
  const actualFingerprint = profile.technicalHeaderFingerprint ?? schema.technicalHeaderFingerprint;
  if (actualFingerprint !== expectedFingerprint) throw new Error("The marketplace template changed while this form was open. Refresh before saving.");
  const allowed = profileFields(schema);
  const seen = new Set<string>();
  let written = 0;
  for (const attribute of submitted) {
    if (!attribute || typeof attribute !== "object") throw new Error("Dynamic attribute payload is invalid.");
    const technicalKey = safeTechnicalKey(attribute.technicalKey);
    if (seen.has(technicalKey)) throw new Error("A dynamic attribute was submitted more than once.");
    seen.add(technicalKey);
    const field = allowed.get(technicalKey);
    if (!field) throw new Error("A submitted dynamic attribute is not part of the selected marketplace template.");
    const scalar = scalarAttributeValue(attribute, field);
    if (!scalar) continue;
    const existing = await tx.marketplaceListingAttribute.findUnique({ where: { marketplaceListingId_technicalKey: { marketplaceListingId: input.listingId, technicalKey } } });
    if (existing && (existing.accountId !== input.accountId || existing.marketplace !== input.marketplace)) throw new Error("Dynamic attribute ownership does not match this listing.");
    await tx.marketplaceListingAttribute.upsert({
      where: { marketplaceListingId_technicalKey: { marketplaceListingId: input.listingId, technicalKey } },
      create: {
        marketplaceListingId: input.listingId,
        accountId: input.accountId,
        marketplace: input.marketplace,
        technicalKey,
        displayLabel: optionalText(field.label, "Dynamic attribute label", 500) ?? technicalKey,
        valueJson: scalar.valueJson,
        valueText: scalar.valueText.slice(0, 4000),
        sourceProfileId: profile.id,
        sourceHeader: optionalText(field.originalHeader, "Dynamic attribute source header", 500),
        sourceAuthority: "MANUAL_OWNER",
        manualLocked: attribute.manualLocked !== false,
        createdByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId
      },
      update: {
        displayLabel: optionalText(field.label, "Dynamic attribute label", 500) ?? technicalKey,
        valueJson: scalar.valueJson,
        valueText: scalar.valueText.slice(0, 4000),
        sourceProfileId: profile.id,
        sourceHeader: optionalText(field.originalHeader, "Dynamic attribute source header", 500),
        sourceAuthority: "MANUAL_OWNER",
        manualLocked: attribute.manualLocked !== false,
        updatedByUserId: input.actorUserId
      }
    });
    written += 1;
  }
  return written;
}

async function authorize(client: PrismaClient | Prisma.TransactionClient, actorUserId: string, accountId: string, kind: "ORDER" | "CONSIGNMENT") {
  const access = await assertWorkerAccountAccess(actorUserId, accountId, client);
  const permitted = kind === "ORDER"
    ? access.user.role === "OWNER"
    : access.user.role === "OWNER" || access.user.canManageConsignments;
  if (!permitted) throw new Error(kind === "ORDER" ? "Owner access is required to resolve Order catalog issues." : "Consignment management permission is required.");
  const account = await client.account.findFirst({ where: { id: accountId, active: true }, select: { id: true, marketplace: true } });
  if (!account) throw new Error("Selected account is unavailable.");
  return { user: access.user, account };
}

async function releaseHeldOrder(tx: Prisma.TransactionClient, input: { accountId: string; orderId: string; listingId: string }) {
  const [order, listing] = await Promise.all([
    tx.order.findFirst({ where: { id: input.orderId, accountId: input.accountId }, include: { workTasks: true } }),
    tx.marketplaceListing.findFirst({ where: { id: input.listingId, accountId: input.accountId }, include: { processRules: { where: { active: true }, orderBy: { updatedAt: "desc" }, take: 1, include: { markingAsset: true } } } })
  ]);
  if (!order || !listing) throw new Error("Held Order or selected listing is unavailable.");
  const existingPick = order.workTasks.find((item) => item.stage === "PICK");
  if (order.workTasks.some((task) => task.stage !== "PICK" || task.status !== "READY" || task.completedQuantity > 0 || task.assignedUserId || task.startedAt || task.completedAt)) {
    throw new Error("Started or historical work cannot receive a newly generated catalog snapshot automatically.");
  }
  const savedRule = listing.processRules[0] ?? null;
  const route = (savedRule?.route ?? "PICK_PACK") as ProcessRoute;
  const provenance = createImmutableRouteProvenance({ route, rule: savedRule });
  const workCardSnapshotJson = JSON.stringify({
    version: 2,
    productTitle: listing.productTitle ?? order.productDescription ?? null,
    primaryImage: listing.mainImageUrl ?? null,
    sellerSku: listing.sellerSkuId,
    operationalBarcode: order.trackingId ?? order.awb,
    marketplaceIdentifiers: { fsn: listing.fsn ?? order.fsn, listingId: listing.listingId, orderItemId: order.orderItemId, trackingId: order.trackingId },
    category: listing.liveCategory,
    brand: listing.liveBrand,
    variantIdentity: null,
    ...provenance
  });
  const routeSnapshotJson = JSON.stringify({ ...createWorkRouteSnapshot({ processRoute: route, currentStage: "PICK" }), ...provenance });
  const task = existingPick
    ? await tx.workTask.update({ where: { id: existingPick.id }, data: { status: "READY", requiredQuantity: order.qty, workCardSnapshotJson, routeSnapshotJson, metadataJson: JSON.stringify({ version: 1, recommendedProcessRoute: route }), version: { increment: 1 } } })
    : await tx.workTask.create({ data: { accountId: input.accountId, sourceType: "ORDER", orderId: order.id, stage: "PICK", sequenceNumber: 1, requiredQuantity: order.qty, status: "READY", metadataJson: JSON.stringify({ version: 1, recommendedProcessRoute: route }), workCardSnapshotJson, routeSnapshotJson } });
  await refreshAffectedWorkGroups({ accountId: input.accountId, sourceType: "ORDER", stages: ["PICK"], taskIds: [task.id], orderIds: [order.id] }, tx);
  await tx.workChangeEvent.create({ data: { accountId: input.accountId, eventType: "MISSING_LISTING_RESOLVED", sourceType: "ORDER", stage: "PICK", entityId: order.id } });
  return task.id;
}

function transient(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (["P1008", "P2028", "P2034"].includes(error.code)) return true;
    if (error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta?.target.join(",") : String(error.meta?.target ?? "");
      const reviewedTargets = [
        ["accountId", "actorUserId", "requestKind", "clientRequestId"],
        ["accountId", "marketplace", "sellerSkuId"],
        ["marketplaceListingId", "identifierType", "normalizedValue"]
      ];
      return reviewedTargets.some((fields) => fields.every((field) => target.includes(field)));
    }
  }
  return /database is locked|write conflict|transaction.*(?:closed|conflict|timeout)/i.test(message);
}

async function runSerializable<T>(client: Client, action: (tx: Prisma.TransactionClient) => Promise<T>) {
  let last: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try { return await client.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      last = error;
      if (!transient(error) || attempt === 5) {
        if (transient(error)) throw new Error("Catalog work is busy; retry the action.");
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
  throw last;
}

async function beginCatalogReceipt<T>(tx: Prisma.TransactionClient, input: Parameters<typeof beginWorkflowActionReceipt<T>>[1]) {
  try { return await beginWorkflowActionReceipt<T>(tx, input); }
  catch (error) {
    if (error instanceof Error && /different workflow action/i.test(error.message)) throw new Error("Request ID was already used with a different payload.");
    throw error;
  }
}

function parseExpectedDate(value: unknown, label: string) {
  const text = boundedId(value, label, 64);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is invalid.`);
  return date;
}

export async function resolveMissingListing(input: ResolveMissingListingInput, client: Client = prisma) {
  const actorUserId = boundedId(input.actorUserId, "Actor user ID");
  const accountId = boundedId(input.accountId, "Account ID");
  const issueId = boundedId(input.issueId, "Missing-listing issue ID");
  const clientRequestId = boundedId(input.clientRequestId, "Client request ID");
  if (!Number.isSafeInteger(input.expectedIssueVersion) || input.expectedIssueVersion < 0) throw new Error("Missing-listing issue version is invalid.");
  const requestFingerprint = hash({ ...input, actorUserId: undefined, accountId: undefined, clientRequestId: undefined });
  await authorize(client, actorUserId, accountId, "ORDER");
  const gateKey = [accountId, actorUserId, "MISSING_LISTING_RESOLUTION", clientRequestId].join(":");

  return withWorkflowActionRequestGate(gateKey, () => runSerializable(client, async (tx) => {
    const { user, account } = await authorize(tx, actorUserId, accountId, "ORDER");
    const receipt = await beginCatalogReceipt<OrderResolutionResult>(tx, {
      accountId,
      actorUserId: user.id,
      requestKind: "MISSING_LISTING_RESOLUTION",
      clientRequestId,
      requestFingerprint,
      sourceType: "ORDER"
    });
    if (receipt.replay) return { ...receipt.replay, idempotent: true };
    const issue = await tx.importRowIssue.findFirst({
      where: { id: issueId, batch: { accountId }, issueType: { in: ["MISSING_FLIPKART_LISTING_MAPPING", "AMBIGUOUS_LISTING"] }, sourceType: "ORDER" },
      include: { batch: { include: { account: true } } }
    });
    if (!issue?.sourceId) throw new Error("Missing-listing issue is unavailable.");
    if (issue.resolved) throw new Error("Missing-listing issue was already resolved; refresh the page.");
    if (issue.version !== input.expectedIssueVersion) throw new Error("Missing-listing issue changed; refresh before saving.");
    if (issue.batch.account.marketplace !== account.marketplace) throw new Error("Missing-listing issue marketplace does not match the selected account.");
    const safe = safeJson(issue.safeDataJson);
    const sellerSku = canonicalSkuIdentity(optionalText(safe.sellerSku, "Protected Seller SKU", 160));
    if (!sellerSku) throw new Error("The held source row has no valid Seller SKU identity.");
    const marketplace = account.marketplace;
    const ambiguous = issue.issueType === "AMBIGUOUS_LISTING";
    const candidateIds = ambiguous ? protectedCandidateIds(safe) : [];
    if (ambiguous && input.action !== "LINK_EXISTING") throw new Error("Choose one exact saved candidate to resolve this ambiguous Order listing.");
    if (ambiguous && candidateIds.length < 2) throw new Error("Saved listing candidates are unavailable; re-import or repair the issue before resolving it.");
    let listing;
    let created = false;
    if (input.action === "LINK_EXISTING") {
      const listingId = boundedId(input.listingId, "Existing listing ID");
      listing = await tx.marketplaceListing.findFirst({ where: { id: listingId, accountId, marketplace } });
      if (!listing) throw new Error("The selected listing is not available in this account and marketplace.");
      if (ambiguous) {
        if (!candidateIds.includes(listing.id)) throw new Error("Choose one of the exact saved candidates for this ambiguous Order.");
      } else {
        const protectedSku = normalizeListingIdentifier("SELLER_SKU", sellerSku);
        const identityMatches = normalizeListingIdentifier("SELLER_SKU", listing.sellerSkuId) === protectedSku
          || Boolean(protectedSku && await tx.marketplaceListingIdentifier.findFirst({ where: { marketplaceListingId: listing.id, accountId, marketplace, identifierType: "SELLER_SKU", normalizedValue: protectedSku, active: true }, select: { id: true } }));
        if (!identityMatches) throw new Error("The selected listing does not match the protected Seller SKU identity.");
      }
    } else {
      listing = await tx.marketplaceListing.findFirst({ where: { accountId, marketplace, sellerSkuId: sellerSku } });
      if (listing) throw new Error("This Seller SKU already has a Product Inventory listing. Link the existing listing instead.");
      listing = await tx.marketplaceListing.create({ data: {
        accountId,
        marketplace,
        sellerSkuId: sellerSku,
        sku: sellerSku,
        fsn: optionalText(safe.fsn, "Protected FSN", 160),
        ...(input.action === "CREATE_MINIMAL" ? { listingStatus: "NEEDS_ENRICHMENT", fieldProvenanceJson: "{}", manualLocksJson: "{}" } : commonListingData(input.common, input.manualLocked !== false))
      } });
      created = true;
    }
    const sourceIdentifiers: ListingIdentifierInput[] = [
      { type: "SELLER_SKU", value: sellerSku },
      ...(safe.fsn ? [{ type: "FSN" as const, value: safe.fsn }] : []),
      ...validatedIdentifiers(input.identifiers)
    ];
    if (!ambiguous) await syncMarketplaceListingIdentifiersInTransaction(tx, { listing, extraIdentifiers: sourceIdentifiers, source: "MANUAL_OWNER", replaceManagedTypes: false });
    if (created && input.action === "CREATE_FULL") await writeDynamicAttributes(tx, { accountId, marketplace, listingId: listing.id, actorUserId: user.id, profileId: input.profileId, expectedProfileTechnicalFingerprint: input.expectedProfileTechnicalFingerprint, attributes: input.attributes });
    const taskId = await releaseHeldOrder(tx, { accountId, orderId: issue.sourceId, listingId: listing.id });
    const changed = await tx.importRowIssue.updateMany({ where: { id: issue.id, resolved: false, version: input.expectedIssueVersion }, data: { resolved: true, resolvedAt: new Date(), resolvedByUserId: user.id, resolutionAction: input.action, version: { increment: 1 } } });
    if (changed.count !== 1) throw new Error("Missing-listing issue changed; refresh before saving.");
    await tx.auditLog.create({ data: { userId: user.id, accountId, action: "MISSING_LISTING_RESOLVED", entityType: "ImportRowIssue", entityId: issue.id, metadata: JSON.stringify({ action: input.action, listingId: listing.id, taskId }) } });
    return completeWorkflowActionReceipt(tx, receipt.receiptId, { listingId: listing.id, taskId, idempotent: false });
  }));
}

export async function resolveConsignmentMissingListing(input: ResolveConsignmentMissingListingInput, client: Client = prisma) {
  const actorUserId = boundedId(input.actorUserId, "Actor user ID");
  const accountId = boundedId(input.accountId, "Account ID");
  const batchId = boundedId(input.batchId, "Consignment batch ID");
  const lineId = boundedId(input.lineId, "Consignment line ID");
  const clientRequestId = boundedId(input.clientRequestId, "Client request ID");
  const expectedLineUpdatedAt = parseExpectedDate(input.expectedLineUpdatedAt, "Expected Consignment line version");
  const requestFingerprint = hash({ ...input, actorUserId: undefined, accountId: undefined, clientRequestId: undefined });
  await authorize(client, actorUserId, accountId, "CONSIGNMENT");
  const gateKey = [accountId, actorUserId, "CONSIGNMENT_MISSING_LISTING_RESOLUTION", clientRequestId].join(":");

  return withWorkflowActionRequestGate(gateKey, () => runSerializable(client, async (tx) => {
    const { user, account } = await authorize(tx, actorUserId, accountId, "CONSIGNMENT");
    const receipt = await beginCatalogReceipt<ConsignmentResolutionResult>(tx, {
      accountId,
      actorUserId: user.id,
      requestKind: "CONSIGNMENT_MISSING_LISTING_RESOLUTION",
      clientRequestId,
      requestFingerprint,
      sourceType: "CONSIGNMENT"
    });
    if (receipt.replay) return { ...receipt.replay, idempotent: true };
    const line = await tx.consignmentLine.findFirst({ where: { id: lineId, consignmentBatchId: batchId, accountId, activated: false, marketplaceListingId: null }, include: { consignmentBatch: true } });
    if (!line) throw new Error("Consignment line is unavailable or was already resolved.");
    if (line.updatedAt.getTime() !== expectedLineUpdatedAt.getTime()) throw new Error("Consignment line changed; refresh before saving.");
    if (line.consignmentBatch.marketplace !== account.marketplace) throw new Error("Consignment marketplace does not match the selected account.");
    const unresolvedIssue = await tx.consignmentImportIssue.findFirst({ where: { consignmentLineId: line.id, consignmentBatchId: batchId, issueType: { in: ["NOT_FOUND", "EXACT_MULTIPLE", "IDENTIFIER_CONFLICT"] }, resolved: false }, select: { id: true, issueType: true, safeDataJson: true } });
    if (!unresolvedIssue) throw new Error("The Consignment listing issue is unavailable or already resolved.");
    const sellerSku = canonicalSkuIdentity(optionalText(line.sellerSkuSource, "Protected Seller SKU", 160));
    const marketplace = account.marketplace;
    const sourceIdentifiers: ListingIdentifierInput[] = [
      ...(sellerSku ? [{ type: "SELLER_SKU" as const, value: sellerSku }] : []),
      ...(line.fsnSource ? [{ type: "FSN" as const, value: line.fsnSource }] : []),
      ...(line.asinSource ? [{ type: "ASIN" as const, value: line.asinSource }] : []),
      ...(line.fnskuSource ? [{ type: "FNSKU" as const, value: line.fnskuSource }] : []),
      ...(line.externalIdSource ? [{ type: "EXTERNAL_ID" as const, value: line.externalIdSource }] : []),
      ...validatedIdentifiers(input.identifiers)
    ];
    let listing;
    let selectedIdentifier: { type: IdentifierType; value: string };
    let selectedRule: { id: string; route: ProcessRoute; markingAssetId: string | null } | null = null;
    let created = false;
    if (input.action === "LINK_EXISTING") {
      const listingId = boundedId(input.listingId, "Existing listing ID");
      listing = await tx.marketplaceListing.findFirst({
        where: { id: listingId, accountId, marketplace },
        include: {
          identifiers: { where: { active: true }, select: { identifierType: true, normalizedValue: true } },
          processRules: { where: { active: true }, orderBy: { updatedAt: "desc" }, take: 1, select: { id: true, route: true, markingAssetId: true } }
        }
      });
      if (!listing) throw new Error("The selected listing is not available in this account and marketplace.");
      const candidates = protectedCandidateIds(safeJson(unresolvedIssue.safeDataJson));
      if (candidates.length && !candidates.includes(listing.id)) throw new Error("Choose one of the exact saved candidates for this Consignment line.");
      const match = matchingListingIdentifier(listing, sourceIdentifiers);
      if (!match) throw new Error("The selected listing does not match a protected Consignment identifier.");
      selectedIdentifier = match;
      selectedRule = listing.processRules[0] ?? null;
    } else {
      if (!sellerSku) throw new Error("A stable Seller SKU or Merchant SKU is required before creating a listing.");
      const existingListing = await tx.marketplaceListing.findFirst({ where: { accountId, marketplace, sellerSkuId: sellerSku } });
      if (existingListing) throw new Error("This Seller SKU already has a Product Inventory listing. Select the existing listing instead.");
      const fallback = {
        productTitle: optionalText(line.productNameSource, "Source product title", 500),
        listingStatus: "NEEDS_ENRICHMENT",
        fieldProvenanceJson: JSON.stringify(line.productNameSource ? { productTitle: { sourceProfile: "CONSIGNMENT_FALLBACK", authority: 100, importedAt: new Date().toISOString(), sourceAuthority: "CONSIGNMENT_FALLBACK" } } : {}),
        manualLocksJson: "{}"
      };
      listing = await tx.marketplaceListing.create({ data: {
        accountId,
        marketplace,
        sellerSkuId: sellerSku,
        sku: sellerSku,
        fsn: optionalText(line.fsnSource, "Source FSN", 160),
        ...(input.action === "CREATE_FULL" ? commonListingData(input.common, input.manualLocked !== false) : fallback)
      } });
      created = true;
      selectedIdentifier = { type: "SELLER_SKU", value: normalizeListingIdentifier("SELLER_SKU", sellerSku)! };
      await syncMarketplaceListingIdentifiersInTransaction(tx, { listing, extraIdentifiers: sourceIdentifiers, source: "MANUAL_OWNER", replaceManagedTypes: false });
    }
    if (created && input.action === "CREATE_FULL") await writeDynamicAttributes(tx, { accountId, marketplace, listingId: listing.id, actorUserId: user.id, profileId: input.profileId, expectedProfileTechnicalFingerprint: input.expectedProfileTechnicalFingerprint, attributes: input.attributes });
    const matchMessage = input.action === "LINK_EXISTING"
      ? "Existing listing selected by manager. Source quantity preserved."
      : `${input.action === "CREATE_FULL" ? "Full" : "Minimal"} listing created by manager. Source quantity preserved.`;
    const changed = await tx.consignmentLine.updateMany({ where: { id: line.id, accountId, consignmentBatchId: batchId, activated: false, marketplaceListingId: null, updatedAt: expectedLineUpdatedAt }, data: { marketplaceListingId: listing.id, matchStatus: "OWNER_SELECTED", matchIdentifierType: selectedIdentifier.type, matchIdentifierValue: selectedIdentifier.value, matchMessage, processRoute: selectedRule?.route ?? null, processRuleId: selectedRule?.id ?? null, markingAssetId: selectedRule?.markingAssetId ?? null } });
    if (changed.count !== 1) throw new Error("Consignment line changed; refresh before saving.");
    await tx.consignmentImportIssue.updateMany({ where: { consignmentLineId: line.id, issueType: { in: ["NOT_FOUND", "EXACT_MULTIPLE", "IDENTIFIER_CONFLICT"] }, resolved: false }, data: { resolved: true, resolvedAt: new Date(), resolvedByUserId: user.id } });
    await tx.auditLog.create({ data: { userId: user.id, accountId, action: "CONSIGNMENT_MISSING_LISTING_RESOLVED", entityType: "ConsignmentLine", entityId: line.id, metadata: JSON.stringify({ batchId, listingId: listing.id, requiredQuantity: line.requiredQuantity, action: input.action }) } });
    return completeWorkflowActionReceipt(tx, receipt.receiptId, { listingId: listing.id, lineId: line.id, requiredQuantity: line.requiredQuantity, idempotent: false });
  }));
}

export async function clearConsignmentListingMatch(input: ClearConsignmentListingInput, client: Client = prisma) {
  const actorUserId = boundedId(input.actorUserId, "Actor user ID");
  const accountId = boundedId(input.accountId, "Account ID");
  const batchId = boundedId(input.batchId, "Consignment batch ID");
  const lineId = boundedId(input.lineId, "Consignment line ID");
  const clientRequestId = boundedId(input.clientRequestId, "Client request ID");
  const expectedLineUpdatedAt = parseExpectedDate(input.expectedLineUpdatedAt, "Expected Consignment line version");
  const requestFingerprint = hash({ batchId, lineId, expectedLineUpdatedAt: expectedLineUpdatedAt.toISOString() });
  await authorize(client, actorUserId, accountId, "CONSIGNMENT");
  const gateKey = [accountId, actorUserId, "CONSIGNMENT_LISTING_CLEAR", clientRequestId].join(":");

  return withWorkflowActionRequestGate(gateKey, () => runSerializable(client, async (tx) => {
    const { user, account } = await authorize(tx, actorUserId, accountId, "CONSIGNMENT");
    const receipt = await beginCatalogReceipt<ConsignmentClearResult>(tx, {
      accountId,
      actorUserId: user.id,
      requestKind: "CONSIGNMENT_LISTING_CLEAR",
      clientRequestId,
      requestFingerprint,
      sourceType: "CONSIGNMENT"
    });
    if (receipt.replay) return { ...receipt.replay, idempotent: true };
    const line = await tx.consignmentLine.findFirst({
      where: { id: lineId, consignmentBatchId: batchId, accountId, activated: false, marketplaceListingId: { not: null } },
      include: { consignmentBatch: true, workTasks: { select: { id: true }, take: 1 } }
    });
    if (!line) throw new Error("Consignment line is unavailable or its listing match was already cleared.");
    if (line.updatedAt.getTime() !== expectedLineUpdatedAt.getTime()) throw new Error("Consignment line changed; refresh before clearing its listing match.");
    if (line.consignmentBatch.marketplace !== account.marketplace) throw new Error("Consignment marketplace does not match the selected account.");
    if (line.workTasks.length) throw new Error("Consignment work already exists; its listing match cannot be cleared.");
    const changed = await tx.consignmentLine.updateMany({
      where: { id: line.id, accountId, consignmentBatchId: batchId, activated: false, marketplaceListingId: line.marketplaceListingId, updatedAt: expectedLineUpdatedAt },
      data: {
        marketplaceListingId: null,
        matchStatus: "NOT_FOUND",
        matchIdentifierType: null,
        matchIdentifierValue: null,
        matchMessage: "Manager cleared the listing match; catalog resolution is required again.",
        processRoute: null,
        processRuleId: null,
        markingAssetId: null
      }
    });
    if (changed.count !== 1) throw new Error("Consignment line changed; refresh before clearing its listing match.");
    const unresolved = await tx.consignmentImportIssue.findFirst({
      where: { consignmentLineId: line.id, consignmentBatchId: batchId, issueType: { in: ["NOT_FOUND", "EXACT_MULTIPLE", "IDENTIFIER_CONFLICT"] }, resolved: false },
      select: { id: true }
    });
    if (!unresolved) {
      await tx.consignmentImportIssue.create({ data: {
        consignmentBatchId: batchId,
        consignmentLineId: line.id,
        rowNumber: line.rowNumber,
        issueType: "NOT_FOUND",
        severity: "ERROR",
        message: "The listing match was cleared by a manager; choose or create an account-scoped listing before activation."
      } });
    }
    await tx.consignmentBatch.updateMany({
      where: { id: batchId, accountId, status: { in: ["DRAFT", "PARSING", "REVIEW_REQUIRED", "READY_TO_ACTIVATE", "FAILED"] } },
      data: { status: "REVIEW_REQUIRED" }
    });
    await tx.auditLog.create({ data: {
      userId: user.id,
      accountId,
      action: "CONSIGNMENT_LISTING_MATCH_CLEARED",
      entityType: "ConsignmentLine",
      entityId: line.id,
      metadata: JSON.stringify({ batchId, priorListingId: line.marketplaceListingId, requiredQuantity: line.requiredQuantity })
    } });
    return completeWorkflowActionReceipt(tx, receipt.receiptId, { lineId: line.id, requiredQuantity: line.requiredQuantity, idempotent: false });
  }));
}
