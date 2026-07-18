import Link from "next/link";
import { AccountSwitcherForm } from "@/components/AccountSwitcherForm";
import { getAvailableAccounts, getSelectedAccount, requireUser } from "@/lib/auth";
import { selectAccountAction } from "./actions";

type AccountsPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function AccountsPage({ searchParams }: AccountsPageProps) {
  const user = await requireUser();
  const [accounts, selectedAccount, params] = await Promise.all([
    getAvailableAccounts(user),
    getSelectedAccount(user),
    searchParams
  ]);

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-8">
      <section className="mx-auto max-w-3xl rounded-md border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-wide text-mint">Account</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Choose seller account</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Accounts are grouped by marketplace. Workers only see accounts assigned to them; owners can switch any account.
        </p>

        {selectedAccount ? (
          <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900">
            Current: {selectedAccount.companyName} / {selectedAccount.marketplace} / {selectedAccount.accountDisplayName ?? selectedAccount.name}
          </div>
        ) : null}

        {params?.error ? (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            Select a valid account.
          </div>
        ) : null}

        {accounts.length > 0 ? (
          <AccountSwitcherForm
            accounts={accounts.map((account) => ({
              id: account.id,
              name: account.name,
              code: account.code,
              companyName: account.companyName,
              marketplace: account.marketplace,
              accountDisplayName: account.accountDisplayName,
              accountCode: account.accountCode,
              active: account.active
            }))}
            selectedAccountId={selectedAccount?.id}
            action={selectAccountAction}
          />
        ) : user.role === "OWNER" ? (
          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-4 text-amber-950">
            <p className="text-sm font-semibold">No seller accounts have been created yet.</p>
            <Link
              href="/owner/accounts"
              prefetch
              className="mt-4 inline-flex min-h-11 items-center rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
            >
              Create First Seller Account
            </Link>
          </div>
        ) : (
          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            No active seller account is assigned to this user. Ask the owner to assign an account.
          </div>
        )}
      </section>
    </main>
  );
}
