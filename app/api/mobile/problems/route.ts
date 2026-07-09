import { getMobilePermissionAccountContext, mobileJson } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const context = await getMobilePermissionAccountContext(request, "canViewAssignedProblems");

  if (!context.ok) {
    return context.response;
  }

  const params = new URL(request.url).searchParams;
  const status = params.get("status") === "RESOLVED" ? "RESOLVED" : "OPEN";
  const problems = await prisma.problemOrder.findMany({
    where: {
      accountId: context.account.id,
      status
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      reason: true,
      details: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      order: {
        select: {
          id: true,
          marketplace: true,
          sku: true,
          qty: true,
          color: true,
          size: true,
          packStatus: true,
          pickStatus: true,
          trackingId: true,
          awb: true,
          productDescription: true,
          imageUrl: true
        }
      },
      reportedBy: {
        select: {
          name: true,
          username: true
        }
      }
    }
  });

  return mobileJson({
    ok: true,
    status,
    problems: problems.map((problem) => ({
      id: problem.id,
      reason: problem.reason,
      details: problem.details,
      status: problem.status,
      createdAt: problem.createdAt,
      resolvedAt: problem.resolvedAt,
      reporter: problem.reportedBy?.name ?? problem.reportedBy?.username ?? null,
      order: {
        id: problem.order.id,
        marketplace: problem.order.marketplace,
        sku: problem.order.sku,
        qty: problem.order.qty,
        color: problem.order.color,
        size: problem.order.size,
        packStatus: problem.order.packStatus,
        pickStatus: problem.order.pickStatus,
        trackingId: problem.order.trackingId,
        awb: problem.order.awb,
        title: problem.order.productDescription,
        mainImageUrl: problem.order.imageUrl
      }
    }))
  });
}
