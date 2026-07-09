import { getMobilePermissionAccountContext, mobileError, mobileJson } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = await getMobilePermissionAccountContext(request, "canViewImports");

  if (!auth.ok) {
    return auth.response;
  }

  const { jobId } = await context.params;
  const job = await prisma.importJob.findFirst({
    where: {
      id: jobId,
      accountId: auth.account.id
    },
    select: {
      id: true,
      marketplace: true,
      importType: true,
      fileName: true,
      status: true,
      totalRows: true,
      processedRows: true,
      createdRows: true,
      updatedRows: true,
      unchangedRows: true,
      duplicateRows: true,
      warningRows: true,
      errorRows: true,
      missingListingRows: true,
      missingImageRows: true,
      startedAt: true,
      finishedAt: true,
      lastError: true,
      updatedAt: true,
      createdAt: true
    }
  });

  if (!job) {
    return mobileError("not_found", "Import job was not found.", 404);
  }

  return mobileJson({ ok: true, job });
}
