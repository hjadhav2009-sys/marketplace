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
