import type { ProcessRoute, WorkStage } from "@prisma/client";
export { selectableForwardStages } from "./route-stage-eligibility";

const ROUTE_STAGES: Record<ProcessRoute, WorkStage[]> = {
  PICK_PACK: ["PICK", "PACK"],
  PICK_MARK_PACK: ["PICK", "MARK", "PACK"],
  PICK_ASSEMBLE_PACK: ["PICK", "ASSEMBLE", "PACK"],
  PICK_MARK_ASSEMBLE_PACK: ["PICK", "MARK", "ASSEMBLE", "PACK"],
};

const ACTUAL_SELECTION_ROUTE: Record<string, ProcessRoute> = {
  DIRECT_PACK: "PICK_PACK",
  MARK: "PICK_MARK_PACK",
  ASSEMBLE: "PICK_ASSEMBLE_PACK",
  MARK_ASSEMBLE: "PICK_MARK_ASSEMBLE_PACK",
};

const STAGES = new Set<WorkStage>(["PICK", "MARK", "ASSEMBLE", "PACK"]);
const ROUTES = new Set<ProcessRoute>(Object.keys(ROUTE_STAGES) as ProcessRoute[]);

type JsonObject = Record<string, unknown>;
export type WorkRoutePresentationSource =
  | "ACTUAL_SELECTION"
  | "ACTUAL_ROUTE"
  | "ACTUAL_STAGES"
  | "METADATA"
  | "SAVED_DEFAULT"
  | "SYSTEM_FALLBACK";

export type WorkRoutePresentation = {
  savedProcessRoute: ProcessRoute | null;
  actualProcessRoute: ProcessRoute | null;
  processRoute: ProcessRoute;
  stages: WorkStage[];
  completedStages: WorkStage[];
  currentStage: WorkStage;
  source: WorkRoutePresentationSource;
  degraded: boolean;
  selectedStages: WorkStage[];
};

function object(value: string | null | undefined, maxLength: number): JsonObject {
  if (!value || value.length > maxLength) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonObject : {};
  } catch {
    return {};
  }
}

function processRoute(value: unknown): ProcessRoute | null {
  return typeof value === "string" && ROUTES.has(value as ProcessRoute) ? value as ProcessRoute : null;
}

function stages(value: unknown): WorkStage[] {
  if (!Array.isArray(value) || value.some((stage) => typeof stage !== "string" || !STAGES.has(stage as WorkStage))) return [];
  const parsed = value as WorkStage[];
  return new Set(parsed).size === parsed.length ? [...parsed] : [];
}

function routeFromStages(value: WorkStage[]): ProcessRoute | null {
  const serialized = value.join(":");
  return (Object.entries(ROUTE_STAGES).find(([, routeStages]) => routeStages.join(":") === serialized)?.[0] as ProcessRoute | undefined) ?? null;
}

function selectedActualRoute(value: unknown): ProcessRoute | null {
  if (typeof value !== "string") return null;
  return processRoute(value) ?? ACTUAL_SELECTION_ROUTE[value] ?? null;
}

export function processRouteStages(route: ProcessRoute): WorkStage[] {
  return [...ROUTE_STAGES[route]];
}

export function resolveWorkRoutePresentation(input: {
  routeSnapshotJson?: string | null;
  metadataJson?: string | null;
  savedProcessRoute?: string | null;
  currentStage: WorkStage;
}): WorkRoutePresentation {
  const snapshot = object(input.routeSnapshotJson, 60_000);
  const metadata = object(input.metadataJson, 40_000);
  const savedProcessRoute = processRoute(input.savedProcessRoute);
  const selectedStages = stages(snapshot.actualStages);
  const completedStages = stages(snapshot.completedStages);
  const exactActualStages = routeFromStages(selectedStages);
  const candidates: Array<{ route: ProcessRoute | null; source: WorkRoutePresentationSource; actual: boolean }> = [
    { route: selectedActualRoute(snapshot.selectedActualRoute) ?? processRoute(snapshot.selectedProcessRoute), source: "ACTUAL_SELECTION", actual: true },
    { route: processRoute(snapshot.actualProcessRoute), source: "ACTUAL_ROUTE", actual: true },
    { route: exactActualStages, source: "ACTUAL_STAGES", actual: true },
    { route: processRoute(metadata.actualProcessRoute) ?? processRoute(metadata.processRoute), source: "METADATA", actual: true },
    { route: savedProcessRoute, source: "SAVED_DEFAULT", actual: false },
    { route: "PICK_PACK", source: "SYSTEM_FALLBACK", actual: false },
  ];
  const resolved = candidates.find((candidate) => candidate.route) ?? candidates[candidates.length - 1];
  const route = resolved.route ?? "PICK_PACK";
  const routeStages = processRouteStages(route);
  return {
    savedProcessRoute,
    actualProcessRoute: resolved.actual ? route : null,
    processRoute: route,
    stages: routeStages,
    completedStages,
    currentStage: input.currentStage,
    source: resolved.source,
    degraded: !routeStages.includes(input.currentStage),
    selectedStages,
  };
}

export function routeRelevantMissingInstructionStages(routeStages: WorkStage[], missingStages: WorkStage[]) {
  const missing = new Set(missingStages);
  return (["MARK", "ASSEMBLE"] as WorkStage[]).filter((stage) => routeStages.includes(stage) && missing.has(stage));
}
