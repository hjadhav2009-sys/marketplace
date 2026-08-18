import type { ProcessRoute } from "@prisma/client";
import { createWorkRouteSnapshot, parseWorkRouteSnapshot } from "./dynamic-route";

export function advanceFinalPackRouteSnapshot(input: { routeSnapshotJson: string | null; processRoute?: ProcessRoute | null }) {
  const prior = parseWorkRouteSnapshot(input.routeSnapshotJson)
    ?? createWorkRouteSnapshot({ processRoute: input.processRoute ?? null, currentStage: "PACK" });
  const preserved = { ...prior };
  delete preserved.selectedNextStage;
  return JSON.stringify({
    ...preserved,
    routeVersion: prior.routeVersion + 1,
    currentStage: "PACK",
    completedStages: [...new Set([...prior.completedStages, "PACK" as const])],
  });
}
