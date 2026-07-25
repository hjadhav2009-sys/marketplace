import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const outputRoot = path.resolve(process.cwd(), ".codex-tmp", "stage4-2c", "approved-designs");

function allowed() {
  return process.env.STAGING_UI_AUDIT === "true" && process.env.STAGE3_SYNTHETIC_STAGING === "true";
}

function boundedText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export async function POST(request: Request) {
  if (!allowed()) return new NextResponse("Not found", { status: 404 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 500_000) return new NextResponse("Too large", { status: 413 });

  let input: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    input = parsed as Record<string, unknown>;
  } catch {
    return new NextResponse("Invalid design specification", { status: 400 });
  }

  const targetComponent = boundedText(input.targetComponent, 200);
  const viewport = boundedText(input.viewport, 40);
  if (!targetComponent || !viewport) return new NextResponse("Target component and viewport are required", { status: 400 });

  const id = randomUUID();
  const specification = {
    version: "ApprovedDesignSpecificationV1",
    id,
    approvedAt: new Date().toISOString(),
    targetComponent,
    viewport,
    sourceRoute: boundedText(input.sourceRoute, 500),
    sourceScenario: boundedText(input.sourceScenario, 200),
    layout: input.layout && typeof input.layout === "object" ? input.layout : {},
    tokens: input.tokens && typeof input.tokens === "object" ? input.tokens : {},
    sectionOrder: Array.isArray(input.sectionOrder) ? input.sectionOrder.slice(0, 50).map((item) => boundedText(item, 100)) : [],
    visibilityRules: input.visibilityRules && typeof input.visibilityRules === "object" ? input.visibilityRules : {},
    desktopMobileRules: input.desktopMobileRules && typeof input.desktopMobileRules === "object" ? input.desktopMobileRules : {},
    interactionNotes: boundedText(input.interactionNotes, 5_000),
    dataRequirements: boundedText(input.dataRequirements, 5_000),
    ownerNotes: boundedText(input.ownerNotes, 10_000),
    overlayLayers: Array.isArray(input.overlayLayers) ? input.overlayLayers.slice(0, 250) : []
  };

  await mkdir(outputRoot, { recursive: true });
  const target = path.join(outputRoot, `${id}.json`);
  const inside = path.relative(outputRoot, target);
  if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) return new NextResponse("Invalid path", { status: 400 });
  await writeFile(target, `${JSON.stringify(specification, null, 2)}\n`, { flag: "wx" });
  return NextResponse.json({ saved: true, id, privatePath: `.codex-tmp/stage4-2c/approved-designs/${id}.json` });
}
