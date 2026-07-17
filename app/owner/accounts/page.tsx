import Link from "next/link";
import type { Marketplace } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { getSelectedAccount, requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { saveOwnerAccountAction, toggleOwnerAccountActiveAction } from "./actions";

type OwnerAccountsPageProps = {
  searchParams?: Promise<{
    saved?: string;
    deactivated?: string;
    reactivated?: string;
    error?: string;
  }>;
};

const marketplaceSections: Array<{
  value: Marketplace;
  label: string;
  description: string;
}> = [
  { value: "FLIPKART", label: "Flipkart", description: "Active marketplace for current pick-and-pack imports." },
  { value: "AMAZON", label: "Amazon", description: "Catalog and consignment imports are available." },
  { value: "MEESHO", label: "Meesho legacy", description: "Legacy PDF account grouping for old Meesho workflows." },
  { value: "OTHER", label: "Other", description: "Reserve for future channels and special operational accounts." }
];

const marketplaceOptions: Array<{ value: Marketplace; label: string }> = [
  { value: "FLIPKART", label: "Flipkart" },
  { value: "MEESHO", label: "Meesho legacy" },
  { value: "AMAZON", label: "Amazon" },
  { value: "MYNTRA", label: "Myntra" },
  { value: "SHOPIFY", label: "Shopify" },
  { value: "WOOCOMMERCE", label: "WooCommerce" },
  { value: "OTHER", label: "Other" }
];

function accountLabel(account: { accountDisplayName: string | null; name: string }) {
  return account.accountDisplayName ?? account.name;
}

function accountCode(account: { accountCode: string | null; code: string }) {
  return account.accountCode ?? account.code;
}

function latestDate(account: { uploadBatches: Array<{ createdAt: Date }>; importJobs: Array<{ createdAt: Date }> }) {
  const dates = [...account.uploadBatches, ...account.importJobs].map((entry) => entry.createdAt.getTime());
  const latest = dates.length > 0 ? Math.max(...dates) : null;
  return latest ? new Date(latest) : null;
}

export default async function OwnerAccountsPage({ searchParams }: OwnerAccountsPageProps) {
  const user = await requireUser(["OWNER"]);
  const selectedAccount = await getSelectedAccount(user);
  const params = await searchParams;
  const accounts = await prisma.account.findMany({
    orderBy: [{ active: "desc" }, { marketplace: "asc" }, { name: "asc" }],
    include: {
      uploadBatches: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true }
      },
      importJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true }
      },
      _count: {
        select: {
          users: true,
          orders: true,
          marketplaceListings: true,
          uploadBatches: true,
          importJobs: true
        }
      }
    }
  });
  const companyName = selectedAccount?.companyName ?? accounts[0]?.companyName ?? "";
  const activeAccounts = accounts.filter((account) => account.active).length;

  return (
    <AppShell allowNoAccount>
      <PageHeader
        eyebrow="Owner"
        title="Marketplace accounts"
        description="Manage company, marketplace, and seller account structure. Workers stay scoped to their assigned account."
        action={activeAccounts > 0 ? { href: "/accounts", label: "Choose account" } : undefined}
      />

      {params?.saved || params?.deactivated || params?.reactivated ? (
        <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-800">
          Account updated.
        </div>
      ) : null}

      {params?.error ? (
        <div className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Choose a marketplace and use a unique account name/code.
        </div>
      ) : null}

      {!selectedAccount && activeAccounts === 0 ? (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-4 text-amber-950">
          <p className="font-bold">No seller accounts have been created yet.</p>
          <p className="mt-1 text-sm">Create your first seller account below to begin importing new production data.</p>
        </div>
      ) : null}

      <section className="mb-5 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company / Organization</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{companyName || "Set up your first seller account"}</h2>
            {selectedAccount ? (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Selected: <span className="font-semibold text-slate-950">{accountLabel(selectedAccount)}</span>{" "}
                <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{selectedAccount.marketplace}</span>
              </p>
            ) : (
              <p className="mt-2 text-sm leading-6 text-slate-600">No seller account is currently selected.</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <SummaryCount label="Accounts" value={accounts.length} />
            <SummaryCount label="Active" value={activeAccounts} />
            <SummaryCount label="Marketplaces" value={new Set(accounts.map((account) => account.marketplace)).size} />
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.7fr_1.3fr]">
        <form action={saveOwnerAccountAction} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Create seller account</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Add one seller login per marketplace account. This keeps imports, listings, workers, and packing work separated.
          </p>
          <div className="mt-5 space-y-4">
            <TextField name="companyName" label="Company / organization" defaultValue={companyName} />
            <MarketplaceSelect defaultValue="FLIPKART" />
            <TextField name="accountDisplayName" label="Account display name" placeholder="Sullery Flipkart Main" />
            <TextField name="accountCode" label="Account code" placeholder="sullery-fk-main" />
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Notes</span>
              <textarea
                name="notes"
                rows={3}
                placeholder="Internal note, store nickname, or seller login hint"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              />
            </label>
            <label className="flex items-center gap-3 rounded-md bg-slate-50 p-3 text-sm font-medium text-slate-700">
              <input name="active" type="checkbox" defaultChecked className="h-5 w-5 accent-pink-700" />
              Active
            </label>
            <SubmitButton pendingText="Saving...">Create account</SubmitButton>
          </div>
        </form>

        <div className="space-y-5">
          {marketplaceSections.map((section) => {
            const marketplaceAccounts = accounts.filter((account) => account.marketplace === section.value);

            return (
              <section key={section.value} className="rounded-md border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-black text-slate-950">{section.label}</h2>
                      <p className="mt-1 text-sm text-slate-600">{section.description}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                      {marketplaceAccounts.length} accounts
                    </span>
                  </div>
                </div>

                {marketplaceAccounts.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {marketplaceAccounts.map((account) => {
                      const lastImportAt = latestDate(account);

                      return (
                        <article key={account.id} className="p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base font-black text-slate-950">{accountLabel(account)}</h3>
                                <span className={`rounded-full px-2 py-1 text-xs font-bold ${account.active ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600"}`}>
                                  {account.active ? "Active" : "Inactive"}
                                </span>
                                {account.id === selectedAccount?.id ? (
                                  <span className="rounded-full bg-pink-50 px-2 py-1 text-xs font-bold text-berry">Selected</span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-sm font-medium text-slate-500">
                                {account.companyName} / {accountCode(account)}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">Last import: {formatDateTime(lastImportAt)}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Link
                                href="/accounts"
                                prefetch
                                className="inline-flex min-h-10 items-center rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800 shadow-sm"
                              >
                                Switch
                              </Link>
                              <form action={toggleOwnerAccountActiveAction}>
                                <input type="hidden" name="accountId" value={account.id} />
                                <input type="hidden" name="active" value={String(!account.active)} />
                                {account.active?<input name="confirmation" aria-label={`Type ${account.code} to confirm deactivation`} placeholder={`Type ${account.code}`} className="mr-2 min-h-10 w-32 rounded-md border px-2 text-sm"/>:null}
                                <button className="min-h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm">
                                  {account.active ? "Deactivate" : "Reactivate"}
                                </button>
                              </form>
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
                            <SummaryCount label="Users" value={account._count.users} />
                            <SummaryCount label="Orders" value={account._count.orders} />
                            <SummaryCount label="Listings" value={account._count.marketplaceListings} />
                            <SummaryCount label="Uploads" value={account._count.uploadBatches} />
                            <SummaryCount label="Jobs" value={account._count.importJobs} />
                          </div>

                          <form action={saveOwnerAccountAction} className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-[0.9fr_0.9fr_0.8fr_auto] xl:items-end">
                            <input type="hidden" name="accountId" value={account.id} />
                            <TextField name="companyName" label="Company" defaultValue={account.companyName} />
                            <TextField name="accountDisplayName" label="Account name" defaultValue={accountLabel(account)} />
                            <TextField name="accountCode" label="Account code" defaultValue={accountCode(account)} />
                            <MarketplaceSelect defaultValue={account.marketplace} />
                            <label className="lg:col-span-2 xl:col-span-3 block">
                              <span className="text-sm font-medium text-slate-700">Notes</span>
                              <input
                                name="notes"
                                defaultValue={account.notes ?? ""}
                                className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
                              />
                            </label>
                            <label className="flex min-h-11 items-center gap-2 rounded-md bg-slate-50 px-3 text-sm font-medium text-slate-700">
                              <input name="active" type="checkbox" defaultChecked={account.active} className="h-5 w-5 accent-pink-700" />
                              Active
                            </label>
                            <div className="lg:col-span-2 xl:col-span-4">
                              <SubmitButton pendingText="Saving..." variant="secondary">
                                Save account
                              </SubmitButton>
                            </div>
                          </form>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-5 text-sm text-slate-500">No seller accounts yet.</div>
                )}
              </section>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}

function SummaryCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function MarketplaceSelect({ defaultValue }: { defaultValue: Marketplace }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">Marketplace</span>
      <select name="marketplace" defaultValue={defaultValue} required className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2">
        {marketplaceOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  name,
  label,
  placeholder,
  defaultValue
}: {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={name !== "notes"}
        className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
      />
    </label>
  );
}
