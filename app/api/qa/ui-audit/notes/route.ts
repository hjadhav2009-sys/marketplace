import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const notesPath = path.resolve(process.cwd(), ".codex-tmp", "stage4-2b", "ui-audit-notes.json");
function allowed() { return process.env.STAGING_UI_AUDIT === "true" && process.env.STAGE3_SYNTHETIC_STAGING === "true"; }

export async function GET() {
  if (!allowed()) return new NextResponse("Not found", { status: 404 });
  try { return NextResponse.json(JSON.parse(await readFile(notesPath, "utf8"))); }
  catch { return NextResponse.json({}); }
}

export async function POST(request: Request) {
  if (!allowed()) return new NextResponse("Not found", { status: 404 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 2_000_000) return new NextResponse("Too large", { status: 413 });
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return new NextResponse("Invalid JSON", { status: 400 }); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new NextResponse("Invalid notes", { status: 400 });
  await mkdir(path.dirname(notesPath), { recursive: true });
  await writeFile(notesPath, `${JSON.stringify(parsed, null, 2)}\n`, { flag: "w" });
  return NextResponse.json({ saved: true });
}

