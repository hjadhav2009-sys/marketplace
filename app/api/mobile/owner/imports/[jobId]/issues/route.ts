import { getMobilePermissionAccountContext, mobileError, mobileJson } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

const pageSizes = new Set([25, 50, 100]);

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

function pageParams(request: Request) {
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const requestedPageSize = Number(params.get("pageSize") ?? "50") || 50;
  const pageSize = pageSizes.has(requestedPageSize) ? requestedPageSize : 50;
  return { page, pageSize };
}

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
      batchId: true,
      warningRows: true,
      errorRows: true,
      missingListingRows: true,
      missingImageRows: true
    }
  });

  if (!job) {
    return mobileError("not_found", "Import job was not found.", 404);
  }

  if (!job.batchId) {
    return mobileJson({
      ok: true,
      page: 1,
      pageSize: 50,
      total: 0,
      summary: {
        warningRows: job.warningRows,
        errorRows: job.errorRows,
        missingListingRows: job.missingListingRows,
        missingImageRows: job.missingImageRows
      },
      issues: []
    });
  }

  const { page, pageSize } = pageParams(request);
  const where = { batchId: job.batchId };
  const [total, issues] = await Promise.all([
    prisma.importRowIssue.count({ where }),
    prisma.importRowIssue.findMany({
      where,
      orderBy: [{ rowNumber: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        rowNumber: true,
        issueType: true,
        message: true,
        createdAt: true
      }
    })
  ]);

  return mobileJson({
    ok: true,
    page,
    pageSize,
    total,
    summary: {
      warningRows: job.warningRows,
      errorRows: job.errorRows,
      missingListingRows: job.missingListingRows,
      missingImageRows: job.missingImageRows
    },
    issues
  });
}
