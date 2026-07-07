import { getMobileAccountContext, mobileJson } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const context = await getMobileAccountContext(request, ["OWNER", "PICKER", "PACKER"]);

  if (!context.ok) {
    return context.response;
  }

  const [readyOrders, openProblems, latestImport] = await Promise.all([
    prisma.order.count({
      where: {
        accountId: context.account.id,
        packStatus: "READY"
      }
    }),
    prisma.problemOrder.count({
      where: {
        accountId: context.account.id,
        status: "OPEN"
      }
    }),
    prisma.importJob.findFirst({
      where: {
        accountId: context.account.id
      },
      select: {
        id: true,
        importType: true,
        status: true,
        updatedAt: true
      },
      orderBy: { updatedAt: "desc" }
    })
  ]);

  return mobileJson({
    ok: true,
    serverTime: new Date().toISOString(),
    account: {
      id: context.account.id,
      marketplace: context.account.marketplace,
      name: context.account.accountDisplayName ?? context.account.name
    },
    counts: {
      readyOrders,
      openProblems
    },
    latestImport
  });
}
