import { getMobilePermissionAccountContext, mobileJson } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

const pageSizes = new Set([10, 25, 50, 100]);

function pageParams(request: Request) {
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const requestedPageSize = Number(params.get("pageSize") ?? "10") || 10;
  const pageSize = pageSizes.has(requestedPageSize) ? requestedPageSize : 10;
  return { page, pageSize };
}

export async function GET(request: Request) {
  const context = await getMobilePermissionAccountContext(request, "canViewImports");

  if (!context.ok) {
    return context.response;
  }

  const { page, pageSize } = pageParams(request);
  const where = { accountId: context.account.id };
  const [total, jobs] = await Promise.all([
    prisma.importJob.count({ where }),
    prisma.importJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
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
        duplicateRows: true,
        warningRows: true,
        errorRows: true,
        missingListingRows: true,
        missingImageRows: true,
        startedAt: true,
        finishedAt: true,
        updatedAt: true,
        createdAt: true
      }
    })
  ]);

  return mobileJson({
    ok: true,
    page,
    pageSize,
    total,
    jobs
  });
}
