import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";

export async function GET(request: Request) {
  if (process.env.STAGING_UI_AUDIT !== "true" || process.env.STAGE3_SYNTHETIC_STAGING !== "true") return new NextResponse("Not found", { status: 404 });
  const relative = new URL(request.url).searchParams.get("path") ?? "";
  const root = path.resolve(process.cwd(), ".codex-tmp", "stage4-2b");
  const candidate = path.resolve(process.cwd(), relative);
  const inside = path.relative(root, candidate);
  const allowedDirectory = inside.startsWith(`screenshots${path.sep}`) || inside.startsWith(`full-page-hires${path.sep}`);
  if (!inside || inside.startsWith("..") || path.isAbsolute(inside) || !allowedDirectory || path.extname(candidate).toLowerCase() !== ".png") return new NextResponse("Not found", { status: 404 });
  try {
    const bytes = await readFile(candidate);
    const output = new URL(request.url).searchParams.get("thumbnail") === "1" ? await sharp(bytes).resize({ width: 240, withoutEnlargement: true }).png().toBuffer() : bytes;
    return new NextResponse(output, { headers: { "content-type": "image/png", "cache-control": "no-store" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
