"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";

type SwitcherAccount = {
  id: string;
  name: string;
  code: string;
  companyName: string;
  marketplace: string;
  accountDisplayName: string | null;
  accountCode: string | null;
  active: boolean;
};

const marketplaceLabels: Record<string, string> = {
  FLIPKART: "Flipkart",
  MEESHO: "Meesho legacy",
  AMAZON: "Amazon",
  MYNTRA: "Myntra",
  SHOPIFY: "Shopify",
  WOOCOMMERCE: "WooCommerce",
  OTHER: "Other"
};

function accountName(account: SwitcherAccount) {
  return account.accountDisplayName ?? account.name;
}

function accountCode(account: SwitcherAccount) {
  return account.accountCode ?? account.code;
}

export function AccountSwitcherForm({
  accounts,
  selectedAccountId,
  action
}: {
  accounts: SwitcherAccount[];
  selectedAccountId?: string | null;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredAccounts = useMemo(
    () =>
      accounts.filter((account) => {
        if (!normalizedQuery) {
          return true;
        }

        return [
          account.companyName,
          account.marketplace,
          marketplaceLabels[account.marketplace],
          accountName(account),
          accountCode(account)
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));
      }),
    [accounts, normalizedQuery]
  );
  const marketplaces = Array.from(new Set(filteredAccounts.map((account) => account.marketplace)));
  const defaultAccountId = selectedAccountId ?? filteredAccounts[0]?.id;

  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Search accounts</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search marketplace, account name, or code"
          className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
        />
      </label>

      <div className="space-y-4">
        {marketplaces.map((marketplace) => {
          const marketplaceAccounts = filteredAccounts.filter((account) => account.marketplace === marketplace);

          return (
            <section key={marketplace} className="rounded-md border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-black text-slate-950">{marketplaceLabels[marketplace] ?? marketplace}</p>
              </div>
              <div className="grid gap-2 p-3">
                {marketplaceAccounts.map((account) => (
                  <label
                    key={account.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm transition hover:border-berry"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-950">{accountName(account)}</span>
                      <span className="text-sm text-slate-500">
                        {account.companyName} / {accountCode(account)} {!account.active ? "/ inactive" : ""}
                      </span>
                    </span>
                    <input
                      type="radio"
                      name="accountId"
                      value={account.id}
                      defaultChecked={account.id === defaultAccountId}
                      className="h-5 w-5 shrink-0 accent-pink-700"
                    />
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {filteredAccounts.length === 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          No account matches that search.
        </div>
      ) : null}

      <SubmitButton>Select account</SubmitButton>
    </form>
  );
}
