import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";
import { getAvailableAccounts, requireUser, roleHomePath } from "@/lib/auth";
import { selectAccountAction } from "./actions";

type AccountsPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function AccountsPage({ searchParams }: AccountsPageProps) {
  const user = await requireUser();
  const accounts = await getAvailableAccounts(user);
  const params = await searchParams;

  if (accounts.length === 1 && !params?.error) {
    redirect(roleHomePath(user.role));
  }

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-8">
      <section className="mx-auto max-w-2xl rounded-md border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-wide text-mint">Account</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Choose seller account</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This keeps uploads, SKU image mappings, pick lists, and packing scans separated by seller account.
        </p>

        {params?.error ? (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            Select a valid account.
          </div>
        ) : null}

        <form action={selectAccountAction} className="mt-6 space-y-4">
          <div className="space-y-3">
            {accounts.map((account, index) => (
              <label
                key={account.id}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm transition hover:border-berry"
              >
                <span>
                  <span className="block font-semibold text-slate-950">{account.name}</span>
                  <span className="text-sm text-slate-500">{account.code}</span>
                </span>
                <input
                  type="radio"
                  name="accountId"
                  value={account.id}
                  defaultChecked={index === 0}
                  className="h-5 w-5 accent-pink-700"
                />
              </label>
            ))}
          </div>

          <SubmitButton>Select account</SubmitButton>
        </form>
      </section>
    </main>
  );
}
