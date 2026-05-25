import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  absoluteCachedImagePath,
  canUserAccessCachedImage,
  contentTypeForCachedImage,
  parseProductImageCacheRoutePath
} from "@/lib/image-cache";

type ProductImageRouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

export async function GET(_request: Request, context: ProductImageRouteContext) {
  const params = await context.params;
  const parsedPath = parseProductImageCacheRoutePath(params.path);

  if (!parsedPath) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!canUserAccessCachedImage(user, parsedPath.accountId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const filePath = absoluteCachedImagePath(parsedPath.relativePath);

  if (!filePath) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  try {
    const [file, fileStat, contentType] = await Promise.all([
      readFile(filePath),
      stat(filePath),
      contentTypeForCachedImage(filePath)
    ]);

    return new Response(file, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileStat.size),
        "Cache-Control": "private, max-age=86400"
      }
    });
  } catch {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }
}
