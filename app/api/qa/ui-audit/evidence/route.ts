import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (process.env.STAGING_UI_AUDIT !== "true" || process.env.STAGE3_SYNTHETIC_STAGING !== "true") return new NextResponse("Not found", { status: 404 });
  const relative = new URL(request.url).searchParams.get("path") ?? "";
  const root = path.resolve(process.cwd(), ".codex-tmp", "stage4-2b", "screenshots");
  const candidate = path.resolve(process.cwd(), relative);
  const inside = path.relative(root, candidate);
  if (!inside || inside.startsWith("..") || path.isAbsolute(inside) || path.extname(candidate).toLowerCase() !== ".png") return new NextResponse("Not found", { status: 404 });
  try {
    return new NextResponse(await readFile(candidate), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

