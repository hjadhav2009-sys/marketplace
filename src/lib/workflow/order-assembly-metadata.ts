export type OrderAssemblyTaskMetadataV1 = {
  version: 1;
  source: "PROCESS_RULE" | "MANUAL";
  marketplaceListingId?: string;
  processRuleId?: string;
  assemblyTitle: string;
  assemblyInstructions: string;
  assemblyImageUrl?: string;
  sellerSkuSnapshot: string;
  productTitleSnapshot?: string;
  productImageSnapshot?: string;
  requestedByUserId: string;
  requestedAt: string;
  requiredByRule: boolean;
};

const MAX_TITLE = 160;
const MAX_INSTRUCTIONS = 2_000;
const MAX_IDENTIFIER = 160;

function clean(value: unknown, max: number) {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

export function normalizeOrderAssemblyImageUrl(value: unknown) {
  const text = clean(value, 2_048);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (!(["http:", "https:"] as string[]).includes(url.protocol) || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function buildOrderAssemblyMetadata(input: Omit<OrderAssemblyTaskMetadataV1, "version" | "requestedAt"> & { requestedAt?: string | Date }) {
  const assemblyTitle = clean(input.assemblyTitle, MAX_TITLE);
  const assemblyInstructions = clean(input.assemblyInstructions, MAX_INSTRUCTIONS);
  const sellerSkuSnapshot = clean(input.sellerSkuSnapshot, MAX_IDENTIFIER);
  const requestedByUserId = clean(input.requestedByUserId, 100);
  const assemblyImageUrl = normalizeOrderAssemblyImageUrl(input.assemblyImageUrl);
  if (!assemblyTitle) throw new Error("Assembly title is required and must be 160 characters or fewer.");
  if (!assemblyInstructions) throw new Error("Assembly instructions are required and must be 2,000 characters or fewer.");
  if (!sellerSkuSnapshot || !requestedByUserId) throw new Error("Assembly task identity is invalid.");
  if (input.assemblyImageUrl && assemblyImageUrl === null) throw new Error("Assembly image URL must be a safe HTTP or HTTPS URL.");
  const requestedAt = input.requestedAt instanceof Date ? input.requestedAt.toISOString() : input.requestedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(requestedAt))) throw new Error("Assembly request time is invalid.");
  const metadata: OrderAssemblyTaskMetadataV1 = {
    version: 1,
    source: input.source,
    marketplaceListingId: clean(input.marketplaceListingId, 100) ?? undefined,
    processRuleId: clean(input.processRuleId, 100) ?? undefined,
    assemblyTitle,
    assemblyInstructions,
    assemblyImageUrl: assemblyImageUrl ?? undefined,
    sellerSkuSnapshot,
    productTitleSnapshot: clean(input.productTitleSnapshot, 500) ?? undefined,
    productImageSnapshot: normalizeOrderAssemblyImageUrl(input.productImageSnapshot) ?? undefined,
    requestedByUserId,
    requestedAt,
    requiredByRule: Boolean(input.requiredByRule)
  };
  return metadata;
}

export function parseOrderAssemblyMetadata(value: string | null | undefined): OrderAssemblyTaskMetadataV1 | null {
  if (!value || value.length > 20_000) return null;
  try {
    const parsed = JSON.parse(value) as Partial<OrderAssemblyTaskMetadataV1>;
    if (parsed.version !== 1 || (parsed.source !== "PROCESS_RULE" && parsed.source !== "MANUAL")) return null;
    return buildOrderAssemblyMetadata({
      source: parsed.source,
      marketplaceListingId: parsed.marketplaceListingId,
      processRuleId: parsed.processRuleId,
      assemblyTitle: parsed.assemblyTitle ?? "",
      assemblyInstructions: parsed.assemblyInstructions ?? "",
      assemblyImageUrl: parsed.assemblyImageUrl,
      sellerSkuSnapshot: parsed.sellerSkuSnapshot ?? "",
      productTitleSnapshot: parsed.productTitleSnapshot,
      productImageSnapshot: parsed.productImageSnapshot,
      requestedByUserId: parsed.requestedByUserId ?? "",
      requestedAt: parsed.requestedAt,
      requiredByRule: Boolean(parsed.requiredByRule)
    });
  } catch {
    return null;
  }
}
