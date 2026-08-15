import { parseOrderMarkingMetadata } from "./route-task-metadata";
import type { OperationalMarkingSnapshot } from "./route-provenance";

export type MarkingGuidance = {
  masterDesignId: string | null;
  designName: string;
  material: string | null;
  position: string | null;
  widthMm: number | null;
  heightMm: number | null;
  power: number | null;
  speed: number | null;
  frequency: number | null;
  passes: number | null;
  instructions: string | null;
  source: "TASK_SNAPSHOT" | "ROUTE_SNAPSHOT" | "LEGACY_ASSET";
};

export type ManualMarkingGuidance = {
  warning: string;
  routedAt: string;
  workerNote: string | null;
};

type MarkingCandidate = Partial<OperationalMarkingSnapshot> & {
  name?: string | null;
  markingAssetName?: string | null;
};

const safeText = (value: unknown, max: number) => {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  return normalized && normalized.length <= max ? normalized : null;
};

const safeNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

function fromCandidate(candidate: MarkingCandidate | null | undefined, source: MarkingGuidance["source"], materialFallback?: string | null) {
  if (!candidate) return null;
  const designName = safeText(candidate.markingAssetName ?? candidate.name, 160);
  const masterDesignId = safeText(candidate.masterDesignId, 160);
  const instructions = safeText(candidate.instructions, 2_000);
  if (!designName && !masterDesignId && !instructions) return null;
  return {
    masterDesignId,
    designName: designName ?? "Saved marking design",
    material: safeText(candidate.material, 160) ?? safeText(materialFallback, 160),
    position: safeText(candidate.markingPosition, 500),
    widthMm: safeNumber(candidate.markingWidthMm),
    heightMm: safeNumber(candidate.markingHeightMm),
    power: safeNumber(candidate.powerSetting),
    speed: safeNumber(candidate.speedSetting),
    frequency: safeNumber(candidate.frequencySetting),
    passes: safeNumber(candidate.passes),
    instructions,
    source,
  } satisfies MarkingGuidance;
}

export function resolveMarkingGuidance(input: {
  metadataJson?: string | null;
  routeSnapshot?: OperationalMarkingSnapshot | null;
  legacyAsset?: MarkingCandidate | null;
  materialFallback?: string | null;
}): MarkingGuidance | null {
  return fromCandidate(parseOrderMarkingMetadata(input.metadataJson), "TASK_SNAPSHOT", input.materialFallback)
    ?? fromCandidate(input.routeSnapshot, "ROUTE_SNAPSHOT", input.materialFallback)
    ?? fromCandidate(input.legacyAsset, "LEGACY_ASSET", input.materialFallback);
}

export function parseManualMarkingGuidance(value: string | null | undefined): ManualMarkingGuidance | null {
  if (!value || value.length > 20_000) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const warning = safeText(parsed.warning, 500);
    const routedAt = safeText(parsed.routedAt, 100);
    if (parsed.instructionStatus !== "MISSING" || !warning || !routedAt || !Number.isFinite(Date.parse(routedAt))) return null;
    return { warning, routedAt, workerNote: safeText(parsed.workerNote, 2_000) };
  } catch {
    return null;
  }
}
