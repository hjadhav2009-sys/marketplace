import { parseOrderAssemblyMetadata } from "./order-assembly-metadata";
import { parseImmutableRouteProvenance } from "./route-provenance-contract";
import { parseConsignmentAssemblyMetadata } from "./route-task-metadata";

export type AssemblyGuidanceModel = {
  title: string;
  instructions: string;
  imageUrl: string | null;
  source: "PROCESS_RULE" | "MANUAL";
  manualWarning: string | null;
  workerNote: string | null;
};

const clean = (value: unknown, max: number) => {
  const text = typeof value === "string" ? value.normalize("NFKC").trim().slice(0, max) : "";
  return text || null;
};

export function resolveAssemblyGuidance(input: {
  metadataJson?: string | null;
  workCardSnapshotJson?: string | null;
  routeSnapshotJson?: string | null;
}): AssemblyGuidanceModel | null {
  const order = parseOrderAssemblyMetadata(input.metadataJson);
  if (order) return {
    title: order.assemblyTitle,
    instructions: order.assemblyInstructions,
    imageUrl: order.assemblyImageUrl ?? null,
    source: order.source,
    manualWarning: order.source === "MANUAL" ? "This Assembly route was added manually. Follow the saved instructions for this task." : null,
    workerNote: null,
  };

  const consignment = parseConsignmentAssemblyMetadata(input.metadataJson);
  if (consignment) return {
    title: consignment.assemblyTitle,
    instructions: consignment.assemblyInstructions,
    imageUrl: consignment.assemblyImageUrl ?? null,
    source: "PROCESS_RULE",
    manualWarning: null,
    workerNote: null,
  };

  const provenance = parseImmutableRouteProvenance(input.workCardSnapshotJson)
    ?? parseImmutableRouteProvenance(input.routeSnapshotJson);
  if (provenance?.assemblyInstructionSnapshot) return {
    title: provenance.assemblyInstructionSnapshot.assemblyTitle,
    instructions: provenance.assemblyInstructionSnapshot.assemblyInstructions,
    imageUrl: provenance.assemblyInstructionSnapshot.assemblyImageUrl ?? null,
    source: "PROCESS_RULE",
    manualWarning: null,
    workerNote: null,
  };

  if (!input.metadataJson || input.metadataJson.length > 20_000) return null;
  try {
    const metadata = JSON.parse(input.metadataJson) as Record<string, unknown>;
    if (metadata.instructionStatus !== "MISSING" || metadata.missingInstructionStage !== "ASSEMBLE") return null;
    return {
      title: "Assembly instructions unavailable",
      instructions: "No Assembly settings or directions were invented for this work.",
      imageUrl: null,
      source: "MANUAL",
      manualWarning: clean(metadata.warning, 500) ?? "Manual route — saved Assembly instructions are unavailable.",
      workerNote: clean(metadata.workerNote, 240),
    };
  } catch {
    return null;
  }
}
