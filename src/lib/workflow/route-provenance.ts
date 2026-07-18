import { createHash } from "node:crypto";
import type { ProcessRoute } from "@prisma/client";

export type RouteRecommendationSource = "EXPLICIT_PRODUCT_RULE" | "SYSTEM_FALLBACK" | "MANUAL_WORKER_SELECTION" | "LEGACY_SNAPSHOT";
export type OperationalMarkingSnapshot = {
  processRuleId: string;
  markingAssetId: string;
  markingAssetName: string;
  masterDesignId?: string | null;
  material?: string | null;
  markingPosition?: string | null;
  markingWidthMm?: number | null;
  markingHeightMm?: number | null;
  powerSetting?: number | null;
  speedSetting?: number | null;
  frequencySetting?: number | null;
  passes?: number | null;
  instructions?: string | null;
};
export type OperationalAssemblySnapshot = {
  processRuleId: string;
  assemblyTitle: string;
  assemblyInstructions: string;
  assemblyImageUrl?: string | null;
};
export type ImmutableRouteProvenance = {
  routeSnapshotVersion: 3;
  routeRecommendation: ProcessRoute;
  routeRecommendationSource: RouteRecommendationSource;
  hasExplicitSavedRoute: boolean;
  savedProcessRoute: ProcessRoute | null;
  savedProcessRuleId: string | null;
  savedProcessRuleUpdatedAt: string | null;
  savedProcessRuleFingerprint: string | null;
  markingInstructionSnapshot: OperationalMarkingSnapshot | null;
  assemblyInstructionSnapshot: OperationalAssemblySnapshot | null;
  catalogSnapshotAt: string;
  workCreatedAt: string;
};

const stable = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const text = (value: string | null | undefined, max = 2_000) => value?.normalize("NFKC").trim().slice(0, max) || null;

export function createImmutableRouteProvenance(input: {
  route: ProcessRoute;
  rule?: {
    id: string;
    route: ProcessRoute;
    updatedAt?: Date | string | null;
    markingRequired?: boolean;
    markingAssetId?: string | null;
    markingAsset?: {
      id: string;
      name: string;
      masterDesignId?: string | null;
      material?: string | null;
      markingPosition?: string | null;
      markingWidthMm?: number | null;
      markingHeightMm?: number | null;
      powerSetting?: number | null;
      speedSetting?: number | null;
      frequencySetting?: number | null;
      passes?: number | null;
      instructions?: string | null;
    } | null;
    assemblyRequired?: boolean;
    assemblyTitle?: string | null;
    assemblyInstructions?: string | null;
    assemblyImageUrl?: string | null;
  } | null;
  now?: Date;
}): ImmutableRouteProvenance {
  const now = input.now ?? new Date(), rule = input.rule ?? null, asset = rule?.markingAsset ?? null;
  const markingInstructionSnapshot = rule?.markingRequired && asset ? {
    processRuleId: rule.id, markingAssetId: asset.id, markingAssetName: text(asset.name, 160) ?? "Marking",
    masterDesignId: text(asset.masterDesignId, 160), material: text(asset.material, 160), markingPosition: text(asset.markingPosition, 500),
    markingWidthMm: asset.markingWidthMm ?? null, markingHeightMm: asset.markingHeightMm ?? null, powerSetting: asset.powerSetting ?? null,
    speedSetting: asset.speedSetting ?? null, frequencySetting: asset.frequencySetting ?? null, passes: asset.passes ?? null, instructions: text(asset.instructions)
  } : null;
  const assemblyInstructionSnapshot = rule?.assemblyRequired && text(rule.assemblyTitle, 160) && text(rule.assemblyInstructions) ? {
    processRuleId: rule.id, assemblyTitle: text(rule.assemblyTitle, 160)!, assemblyInstructions: text(rule.assemblyInstructions)!, assemblyImageUrl: text(rule.assemblyImageUrl, 2_048)
  } : null;
  const ruleFingerprint = rule ? stable({ id: rule.id, route: rule.route, updatedAt: rule.updatedAt ? new Date(rule.updatedAt).toISOString() : null, markingInstructionSnapshot, assemblyInstructionSnapshot }) : null;
  return {
    routeSnapshotVersion: 3, routeRecommendation: input.route,
    routeRecommendationSource: rule ? "EXPLICIT_PRODUCT_RULE" : "SYSTEM_FALLBACK",
    hasExplicitSavedRoute: Boolean(rule), savedProcessRoute: rule?.route ?? null, savedProcessRuleId: rule?.id ?? null,
    savedProcessRuleUpdatedAt: rule?.updatedAt ? new Date(rule.updatedAt).toISOString() : null, savedProcessRuleFingerprint: ruleFingerprint,
    markingInstructionSnapshot, assemblyInstructionSnapshot, catalogSnapshotAt: now.toISOString(), workCreatedAt: now.toISOString()
  };
}

export function parseImmutableRouteProvenance(value: string | null | undefined): ImmutableRouteProvenance | null {
  if (!value || value.length > 60_000) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ImmutableRouteProvenance>;
    if (parsed.routeSnapshotVersion !== 3 || !parsed.routeRecommendation || !parsed.routeRecommendationSource || typeof parsed.hasExplicitSavedRoute !== "boolean") return null;
    return parsed as ImmutableRouteProvenance;
  } catch { return null; }
}

export function legacyRouteProvenance(route: ProcessRoute): ImmutableRouteProvenance {
  const now = new Date(0).toISOString();
  return { routeSnapshotVersion: 3, routeRecommendation: route, routeRecommendationSource: "LEGACY_SNAPSHOT", hasExplicitSavedRoute: false, savedProcessRoute: null, savedProcessRuleId: null, savedProcessRuleUpdatedAt: null, savedProcessRuleFingerprint: null, markingInstructionSnapshot: null, assemblyInstructionSnapshot: null, catalogSnapshotAt: now, workCreatedAt: now };
}
