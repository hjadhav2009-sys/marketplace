import { createHash } from "node:crypto";
import type { ProcessRoute, WorkStage } from "@prisma/client";

export type WorkRouteDecisionReason = "DEFAULT" | "WORKER_SELECTION" | "MANAGER_OVERRIDE";
export type WorkRouteSnapshotV2 = {
  version: 2;
  routeVersion: number;
  recommendedStages: WorkStage[];
  actualStages: WorkStage[];
  completedStages: WorkStage[];
  currentStage: WorkStage;
  selectedNextStage?: WorkStage;
  decisions: Array<{ fromStage: WorkStage; toStage: WorkStage; actorUserId: string; decidedAt: string; reason: WorkRouteDecisionReason }>;
};

const RECOMMENDED: Record<ProcessRoute, WorkStage[]> = {
  PICK_PACK: ["PICK", "PACK"], PICK_MARK_PACK: ["PICK", "MARK", "PACK"], PICK_ASSEMBLE_PACK: ["PICK", "ASSEMBLE", "PACK"], PICK_MARK_ASSEMBLE_PACK: ["PICK", "MARK", "ASSEMBLE", "PACK"]
};

export function recommendedStages(route: ProcessRoute | null | undefined) { return route ? [...RECOMMENDED[route]] : ["PICK", "PACK"] as WorkStage[]; }

export function createWorkRouteSnapshot(input: { processRoute?: ProcessRoute | null; currentStage: WorkStage; routeVersion?: number }): WorkRouteSnapshotV2 {
  return { version: 2, routeVersion: input.routeVersion ?? 1, recommendedStages: recommendedStages(input.processRoute), actualStages: [input.currentStage], completedStages: [], currentStage: input.currentStage, decisions: [] };
}

export function parseWorkRouteSnapshot(value: string | null | undefined) {
  if (!value || value.length > 40_000) return null;
  try { const parsed = JSON.parse(value) as WorkRouteSnapshotV2; if (parsed.version !== 2 || !Number.isSafeInteger(parsed.routeVersion) || !Array.isArray(parsed.actualStages) || !Array.isArray(parsed.completedStages) || !Array.isArray(parsed.decisions)) return null; return parsed; } catch { return null; }
}

export function recommendedNextStage(snapshot: WorkRouteSnapshotV2, fromStage: WorkStage) {
  const at = snapshot.recommendedStages.indexOf(fromStage);
  return snapshot.recommendedStages.slice(at + 1).find((stage) => !snapshot.completedStages.includes(stage)) ?? "PACK";
}

export function assertValidStageTransition(snapshot: WorkRouteSnapshotV2, from: WorkStage, to?: WorkStage) {
  if (from === "PACK") { if (to) throw new Error("Packing is final and cannot route work backwards."); return; }
  if (!to) throw new Error("Choose a valid next stage.");
  const allowed = from === "PICK" ? ["MARK", "ASSEMBLE", "PACK"] : from === "MARK" ? ["ASSEMBLE", "PACK"] : ["MARK", "PACK"];
  if (!allowed.includes(to)) throw new Error("That stage transition is not allowed.");
  if (snapshot.completedStages.includes(to) || snapshot.actualStages.includes(to)) throw new Error(`${to === "MARK" ? "Marking" : to === "ASSEMBLE" ? "Assembly" : "Packing"} was already selected or completed.`);
  if (to === "MARK" && snapshot.completedStages.includes("MARK")) throw new Error("Marking was already completed.");
  if (to === "ASSEMBLE" && snapshot.completedStages.includes("ASSEMBLE")) throw new Error("Assembly was already completed.");
}

export function routeFingerprint(value: Record<string, unknown>) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
