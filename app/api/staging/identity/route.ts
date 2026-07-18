import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.STAGE3_RUNTIME_IDENTITY_TOKEN;
  if (process.env.STAGE3_SYNTHETIC_STAGING !== "true" || !token) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json({
    environment: "PRIVATE_SYNTHETIC_STAGING",
    pid: process.pid,
    tokenSha256: createHash("sha256").update(token).digest("hex")
  }, { headers: { "Cache-Control": "no-store" } });
}
