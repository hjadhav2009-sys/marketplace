import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount, requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  changeUserPasswordAction,
  closeUserSessionsAction,
  createUserAction,
  deactivateUserAction,
  reactivateUserAction,
  unlockUserAction,
  updateUserAction
} from "./actions";

type UsersPageProps = {
  searchParams?: Promise<{
    created?: string;
    updated?: string;
    password?: string;
    deactivated?: string;
    reactivated?: string;
    sessions?: string;
    unlocked?: string;
    error?: string;
  }>;
};

const errorMessage: Record<string, string> = {
  invalid: "Check the user details and try again.",
  account: "Choose a valid account for this worker.",
  password: "Use at least 8 characters and avoid demo passwords.",
  unique: "That username is already in use.",
  "self-owner": "You cannot remove your own owner role.",
  "self-deactivate": "You cannot deactivate your own owner login.",
  "self-session": "You cannot close your own current sessions from this page."
};

export default async function OwnerUsersPage({ searchParams }: UsersPageProps) {
  const owner = await requireUser(["OWNER"]);
  await requireAccount(owner);
  const params = await searchParams;
  const [users, accounts] = await Promise.all([
    prisma.user.findMany({
      include: {
        account: true,
        sessions: {
          orderBy: { lastSeenAt: "desc" },
          take: 4
        },
        _count: {
          select: {
            sessions: {
              where: { active: true }
            }
          }
        }
      },
      orderBy: [{ active: "desc" }, { role: "asc" }, { username: "asc" }]
    }),
    prisma.account.findMany({
      orderBy: { name: "asc" }
    })
  ]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Security"
        title="Worker users and sessions"
        description="Create picker and packer logins, assign accounts, reset passwords, and close sessions for unknown devices."
      />

      {params?.created ? <SuccessBanner message="User created. They must change password after login." /> : null}
      {params?.updated ? <SuccessBanner message="User updated." /> : null}
      {params?.password ? <SuccessBanner message="Password changed." /> : null}
      {params?.deactivated ? <SuccessBanner message="User deactivated and sessions closed." /> : null}
      {params?.reactivated ? <SuccessBanner message="User reactivated." /> : null}
      {params?.sessions ? <SuccessBanner message="User sessions closed." /> : null}
      {params?.unlocked ? <SuccessBanner message="User unlocked." /> : null}

      {params?.error ? (
        <div className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {errorMessage[params.error] ?? "Could not update that user."}
        </div>
      ) : null}

      <section className="mb-6 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 rounded-md bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
          Passwords are securely hashed and cannot be viewed. Owner can reset passwords and force a password change on next login.
        </div>
        <h2 className="text-lg font-bold text-slate-950">Create user</h2>
        <form action={createUserAction} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <TextField name="name" label="Name" placeholder="Packing staff" />
          <TextField name="username" label="Username" placeholder="packer2" />
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Role</span>
            <select name="role" defaultValue="PACKER" className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="PICKER">Picker</option>
              <option value="PACKER">Packer</option>
              <option value="OWNER">Owner</option>
            </select>
          </label>
          <AccountSelect accounts={accounts} defaultValue={accounts[0]?.id ?? ""} />
          <TextField name="password" label="Temporary password" type="password" placeholder="At least 8 characters" />
          <div className="md:col-span-2 xl:col-span-5">
            <p className="mb-3 text-sm text-slate-500">
              Avoid demo passwords. Use at least 12 characters with letters, numbers, and a symbol for production.
              New users are asked to change the temporary password after login.
            </p>
            <SubmitButton pendingText="Creating...">Create user</SubmitButton>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        {users.map((user) => {
          const isSelf = user.id === owner.id;

          return (
            <article key={user.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-950">{user.name}</h2>
                    <StatusBadge value={user.active ? "ACTIVE" : "INACTIVE"} />
                    <StatusBadge value={user.role} />
                    {user.mustChangePassword ? <StatusBadge value="PASSWORD_REQUIRED" /> : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {user.username} - {user.account ? `${user.account.marketplace} / ${user.account.accountDisplayName ?? user.account.name}` : "All accounts"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Last login {formatDateTime(user.lastLoginAt)} - {user.lastLoginIp ?? "IP not recorded"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                    <span className="rounded-full bg-slate-100 px-2 py-1">Active sessions: {user._count.sessions}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1">Failed logins: {user.failedLoginCount}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1">
                      Locked until: {user.lockedUntil ? formatDateTime(user.lockedUntil) : "Not locked"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {user.lockedUntil || user.failedLoginCount > 0 ? (
                    <form action={unlockUserAction}>
                      <input type="hidden" name="userId" value={user.id} />
                      <SubmitButton pendingText="Unlocking..." variant="secondary">
                        Unlock
                      </SubmitButton>
                    </form>
                  ) : null}
                  {user.active && !isSelf ? (
                    <form action={deactivateUserAction}>
                      <input type="hidden" name="userId" value={user.id} />
                      <SubmitButton pendingText="Deactivating..." variant="secondary">
                        Deactivate
                      </SubmitButton>
                    </form>
                  ) : null}
                  {!user.active ? (
                    <form action={reactivateUserAction}>
                      <input type="hidden" name="userId" value={user.id} />
                      <SubmitButton pendingText="Reactivating..." variant="secondary">
                        Reactivate
                      </SubmitButton>
                    </form>
                  ) : null}
                  {!isSelf ? (
                    <form action={closeUserSessionsAction}>
                      <input type="hidden" name="userId" value={user.id} />
                      <SubmitButton pendingText="Closing..." variant="secondary">
                        Close sessions
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                <form action={updateUserAction} className="rounded-md border border-slate-200 p-4">
                  <input type="hidden" name="userId" value={user.id} />
                  <h3 className="font-semibold text-slate-950">Edit access</h3>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <TextField name="name" label="Name" defaultValue={user.name} />
                    <TextField name="username" label="Username" defaultValue={user.username} />
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">Role</span>
                      {isSelf ? (
                        <>
                          <input type="hidden" name="role" value="OWNER" />
                          <input
                            value="Owner"
                            disabled
                            className="mt-1 min-h-11 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500"
                          />
                        </>
                      ) : (
                        <select name="role" defaultValue={user.role} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2">
                          <option value="PICKER">Picker</option>
                          <option value="PACKER">Packer</option>
                          <option value="OWNER">Owner</option>
                        </select>
                      )}
                    </label>
                    <AccountSelect accounts={accounts} defaultValue={user.accountId ?? ""} />
                  </div>
                  <div className="mt-4">
                    <SubmitButton pendingText="Saving...">Save user</SubmitButton>
                  </div>
                </form>

                <form action={changeUserPasswordAction} className="rounded-md border border-slate-200 p-4">
                  <input type="hidden" name="userId" value={user.id} />
                  <h3 className="font-semibold text-slate-950">Change password</h3>
                  <TextField name="password" label="New password" type="password" placeholder="At least 8 characters" />
                  <label className="mt-3 flex items-start gap-3 rounded-md bg-slate-50 p-3 text-sm font-medium text-slate-700">
                    <input name="mustChangePassword" type="checkbox" defaultChecked={!isSelf} className="mt-1 h-4 w-4 rounded border-slate-300" />
                    Force password change on next login
                  </label>
                  <p className="mt-2 text-sm text-slate-500">
                    Use at least 12 characters with letters, numbers, and a symbol for production.
                    Resetting another user&apos;s password closes their active sessions.
                  </p>
                  <div className="mt-4">
                    <SubmitButton pendingText="Changing..." variant="secondary">
                      Change password
                    </SubmitButton>
                  </div>
                </form>
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
          );
        })}
      </section>
    </AppShell>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
      {message}
    </div>
  );
}

function TextField({
  name,
  label,
  type = "text",
  placeholder,
  defaultValue
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        minLength={type === "password" ? 8 : undefined}
        className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
        required
      />
    </label>
  );
}

function AccountSelect({
  accounts,
  defaultValue = ""
}: {
  accounts: Array<{ id: string; name: string; code: string; marketplace: string; accountDisplayName: string | null; accountCode: string | null }>;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">Account</span>
      <select name="accountId" defaultValue={defaultValue} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2">
        <option value="">All accounts / owner only</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.marketplace} / {account.accountDisplayName ?? account.name} / {account.accountCode ?? account.code}
          </option>
        ))}
      </select>
    </label>
  );
}
