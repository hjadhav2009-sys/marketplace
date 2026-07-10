import { Readable } from "node:stream";
import { getCurrentUser, getSelectedAccount } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageMarkingLibrary, markingAssetAccessWhere } from "@/src/lib/marking/access";
import { openMarkingAssetReadStream, sanitizeMarkingFileName } from "@/src/lib/marking/storage";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string; fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Login required.", { status: 401 });
  if (!canManageMarkingLibrary(user)) return new Response("Forbidden.", { status: 403 });
  const account = await getSelectedAccount(user);
  if (!account) return new Response("Account required.", { status: 403 });
  const { assetId, fileId } = await params;
  const file = await prisma.markingAssetFile.findFirst({ where: { id: fileId, markingAssetId: assetId, markingAsset: markingAssetAccessWhere(user, account.id) } });
  if (!file) return new Response("File not found.", { status: 404 });

  try {
    const stream = await openMarkingAssetReadStream(file.managedRelativePath);
    const inline = new URL(request.url).searchParams.get("inline") === "1" && file.attachmentType === "MARKING_PREVIEW";
    const fileName = sanitizeMarkingFileName(file.originalFileName).replace(/["\r\n]/g, "_");
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Cache-Control": inline ? "private, max-age=300" : "private, no-store",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fileName}"`,
        "Content-Length": String(file.fileSizeBytes),
        "Content-Type": file.contentType,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return new Response("Managed file is unavailable.", { status: 404 });
  }
}
