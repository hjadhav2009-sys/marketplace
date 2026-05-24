import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount, requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { deactivateUserAction } from "./actions";

type UsersPageProps = {
  searchParams?: Promise<{
    deactivated?: string;
    error?: string;
  }>;
};

export default async function OwnerUsersPage({ searchParams }: UsersPageProps) {
  const owner = await requireUser(["OWNER"]);
  await requireAccount(owner);
  const params = await searchParams;
  const users = await prisma.user.findMany({
    include: {
      account: true,
      sessions: {
        orderBy: { lastSeenAt: "desc" },
        take: 4
      }
    },
    orderBy: [{ active: "desc" }, { role: "asc" }, { username: "asc" }]
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="Security"
        title="Users and device sessions"
        description="Review recent devices and deactivate a worker account if an unknown device appears."
      />

      {params?.deactivated ? (
        <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
          User deactivated and sessions closed.
        </div>
      ) : null}

      {params?.error ? (
        <div className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Could not update that user.
        </div>
      ) : null}

      <section className="space-y-4">
        {users.map((user) => (
          <article key={user.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-950">{user.name}</h2>
                  <StatusBadge value={user.active ? "ACTIVE" : "INACTIVE"} />
                  <StatusBadge value={user.role} />
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {user.username} · {user.account?.name ?? "All accounts"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Last login {formatDateTime(user.lastLoginAt)} · {user.lastLoginIp ?? "IP not recorded"}
                </p>
              </div>
              {user.active && user.id !== owner.id ? (
                <form action={deactivateUserAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <SubmitButton pendingText="Deactivating..." variant="secondary">
                    Deactivate
                  </SubmitButton>
                </form>
              ) : null}
            </div>

            <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">IP</th>
                    <th className="px-3 py-2">User agent</th>
                    <th className="px-3 py-2">Last active</th>
                    <th className="px-3 py-2">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {user.sessions.map((session) => (
                    <tr key={session.id}>
                      <td className="px-3 py-2 font-semibold text-slate-950">{session.ipAddress ?? "Unknown"}</td>
                      <td className="max-w-sm truncate px-3 py-2 text-slate-600">{session.userAgent ?? "Unknown"}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDateTime(session.lastSeenAt)}</td>
                      <td className="px-3 py-2">{session.active ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                  {user.sessions.length === 0 ? (
                    <tr>
                      <td className="px-3 py-5 text-center text-slate-500" colSpan={4}>
                        No sessions recorded yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
