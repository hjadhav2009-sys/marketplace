import { getMobilePermissionUser, mobileJson } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await getMobilePermissionUser("canViewSystem");

  if (!auth.ok) {
    return auth.response;
  }

  const [activeAccounts, activeUsers, openProblems, recentImport] = await Promise.all([
    prisma.account.count({ where: { active: true } }),
    prisma.user.count({ where: { active: true } }),
    prisma.problemOrder.count({ where: { status: "OPEN" } }),
    prisma.importJob.findFirst({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        importType: true,
        marketplace: true,
        updatedAt: true
      }
    })
  ]);

  return mobileJson({
    ok: true,
    app: {
      name: "Marketplace Pick & Pack",
      mode: "local-or-private-vpn",
      mobileApi: "available"
    },
    counts: {
      activeAccounts,
      activeUsers,
      openProblems
    },
    recentImport,
    notes: [
      "Database stays on the owner PC.",
      "Use Tailscale or same Wi-Fi for Android access.",
      "Do not use public router port forwarding without proper hardening."
    ]
  });
}
