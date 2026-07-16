import type { MarkingAsset } from "@prisma/client";

export type RouteSnapshotV1 = {
  version: 1;
  routeChoice: "DIRECT_PACK" | "MARK" | "ASSEMBLE" | "MARK_ASSEMBLE";
  processRoute: "PICK_PACK" | "PICK_MARK_PACK" | "PICK_ASSEMBLE_PACK" | "PICK_MARK_ASSEMBLE_PACK";
  requestFingerprint: string;
};

export type OrderMarkingTaskMetadataV1 = RouteSnapshotV1 & {
  source: "PROCESS_RULE";
  marketplaceListingId: string;
  processRuleId: string;
  markingAssetId: string;
  markingAssetName: string;
  masterDesignId?: string;
  material?: string;
  markingPosition?: string;
  markingWidthMm?: number;
  markingHeightMm?: number;
  powerSetting?: number;
  speedSetting?: number;
  frequencySetting?: number;
  passes?: number;
  instructions?: string;
  sellerSkuSnapshot: string;
  productTitleSnapshot?: string;
  productImageSnapshot?: string;
  requestedByUserId: string;
  requestedAt: string;
};

type AssetSnapshot = Pick<MarkingAsset, "id" | "name" | "masterDesignId" | "material" | "markingPosition" | "markingWidthMm" | "markingHeightMm" | "powerSetting" | "speedSetting" | "frequencySetting" | "passes" | "instructions">;

function optionalText(value: string | null | undefined, max = 2_000) {
  const text = value?.normalize("NFKC").trim();
  return text && text.length <= max ? text : undefined;
}

export function buildOrderMarkingMetadata(input: RouteSnapshotV1 & { marketplaceListingId: string; processRuleId: string; asset: AssetSnapshot; sellerSkuSnapshot: string; productTitleSnapshot?: string | null; productImageSnapshot?: string | null; requestedByUserId: string }) {
  const markingAssetName = optionalText(input.asset.name, 160);
  const sellerSkuSnapshot = optionalText(input.sellerSkuSnapshot, 160);
  if (!markingAssetName || !sellerSkuSnapshot || !input.asset.id || !input.marketplaceListingId || !input.processRuleId || !input.requestedByUserId) throw new Error("Marking instructions are incomplete for this product.");
  return {
    version: 1, routeChoice: input.routeChoice, processRoute: input.processRoute, requestFingerprint: input.requestFingerprint,
    source: "PROCESS_RULE", marketplaceListingId: input.marketplaceListingId, processRuleId: input.processRuleId,
    markingAssetId: input.asset.id, markingAssetName, masterDesignId: optionalText(input.asset.masterDesignId, 160), material: optionalText(input.asset.material, 160),
    markingPosition: optionalText(input.asset.markingPosition, 500), markingWidthMm: input.asset.markingWidthMm ?? undefined, markingHeightMm: input.asset.markingHeightMm ?? undefined,
    powerSetting: input.asset.powerSetting ?? undefined, speedSetting: input.asset.speedSetting ?? undefined, frequencySetting: input.asset.frequencySetting ?? undefined,
    passes: input.asset.passes ?? undefined, instructions: optionalText(input.asset.instructions), sellerSkuSnapshot,
    productTitleSnapshot: optionalText(input.productTitleSnapshot, 500), productImageSnapshot: optionalText(input.productImageSnapshot, 2_048),
    requestedByUserId: input.requestedByUserId, requestedAt: new Date().toISOString()
  } satisfies OrderMarkingTaskMetadataV1;
}

export function parseOrderMarkingMetadata(value: string | null | undefined): OrderMarkingTaskMetadataV1 | null {
  if (!value || value.length > 20_000) return null;
  try {
    const parsed = JSON.parse(value) as OrderMarkingTaskMetadataV1;
    if (parsed.version !== 1 || parsed.source !== "PROCESS_RULE" || !parsed.markingAssetId || !parsed.markingAssetName || !parsed.sellerSkuSnapshot || !parsed.requestedByUserId || !Number.isFinite(Date.parse(parsed.requestedAt))) return null;
    return parsed;
  } catch { return null; }
}

export type ConsignmentAssemblyTaskMetadataV1 = RouteSnapshotV1 & {
  source: "PROCESS_RULE";
  processRuleId: string;
  assemblyTitle: string;
  assemblyInstructions: string;
  assemblyImageUrl?: string;
  sellerSkuSnapshot: string;
  productTitleSnapshot?: string;
  productImageSnapshot?: string;
  requestedByUserId: string;
  requestedAt: string;
};

export function buildConsignmentAssemblyMetadata(input: Omit<ConsignmentAssemblyTaskMetadataV1, "version" | "source" | "requestedAt">) {
  const assemblyTitle = optionalText(input.assemblyTitle, 160);
  const assemblyInstructions = optionalText(input.assemblyInstructions, 2_000);
  const sellerSkuSnapshot = optionalText(input.sellerSkuSnapshot, 160);
  const productTitleSnapshot = optionalText(input.productTitleSnapshot, 500);
  const productImageSnapshot = optionalText(input.productImageSnapshot, 2_048);
  const assemblyImageUrl = optionalText(input.assemblyImageUrl, 2_048);
  if (!assemblyTitle || !assemblyInstructions || !sellerSkuSnapshot || !input.processRuleId || !input.requestedByUserId) throw new Error("Usable assembly instructions are required before routing this work.");
  for (const candidate of [assemblyImageUrl, productImageSnapshot]) if (candidate) { const url = new URL(candidate); if (!(["http:", "https:"] as string[]).includes(url.protocol) || url.username || url.password) throw new Error("Assembly reference images must use safe HTTP or HTTPS URLs."); }
  return { version: 1, source: "PROCESS_RULE", routeChoice: input.routeChoice, processRoute: input.processRoute, requestFingerprint: input.requestFingerprint, processRuleId: input.processRuleId, assemblyTitle, assemblyInstructions, assemblyImageUrl, sellerSkuSnapshot, productTitleSnapshot, productImageSnapshot, requestedByUserId: input.requestedByUserId, requestedAt: new Date().toISOString() } satisfies ConsignmentAssemblyTaskMetadataV1;
}

export function parseConsignmentAssemblyMetadata(value: string | null | undefined): ConsignmentAssemblyTaskMetadataV1 | null {
  if (!value || value.length > 20_000) return null;
  try {
    const parsed = JSON.parse(value) as ConsignmentAssemblyTaskMetadataV1;
    if (parsed.version !== 1 || parsed.source !== "PROCESS_RULE" || !parsed.processRuleId || !parsed.assemblyTitle?.trim() || parsed.assemblyTitle.length > 160 || !parsed.assemblyInstructions?.trim() || parsed.assemblyInstructions.length > 2_000 || !parsed.sellerSkuSnapshot || parsed.sellerSkuSnapshot.length > 160 || !parsed.requestedByUserId || !Number.isFinite(Date.parse(parsed.requestedAt))) return null;
    return parsed;
  } catch { return null; }
}
