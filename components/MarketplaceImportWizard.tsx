"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";

type ImportAccount = {
  id: string;
  name: string;
  code: string;
  companyName: string;
  marketplace: string;
  accountDisplayName: string | null;
  accountCode: string | null;
  active: boolean;
};

type WizardAction = (formData: FormData) => void | Promise<void>;

const marketplaceOptions = [
  { value: "FLIPKART", label: "Flipkart" },
  { value: "MEESHO", label: "Meesho legacy" },
  { value: "AMAZON", label: "Amazon coming soon" }
];

function accountLabel(account: ImportAccount) {
  return account.accountDisplayName ?? account.name;
}

function accountCode(account: ImportAccount) {
  return account.accountCode ?? account.code;
}

export function MarketplaceImportWizard({
  accounts,
  selectedAccountId,
  listingAction,
  flipkartOrdersAction,
  legacyPdfAction
}: {
  accounts: ImportAccount[];
  selectedAccountId: string;
  listingAction: WizardAction;
  flipkartOrdersAction: WizardAction;
  legacyPdfAction: WizardAction;
}) {
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const [marketplace, setMarketplace] = useState(selectedAccount?.marketplace ?? "FLIPKART");
  const [chosenAccountId, setChosenAccountId] = useState(selectedAccountId);
  const filteredAccounts = useMemo(
    () => accounts.filter((account) => account.active && account.marketplace === marketplace),
    [accounts, marketplace]
  );
  const selectedAccountStillValid = filteredAccounts.some((account) => account.id === chosenAccountId);
  const accountId = selectedAccountStillValid ? chosenAccountId : filteredAccounts[0]?.id ?? "";

  return (
    <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="space-y-4">
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Import setup</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Choose marketplace and seller account first. Imports are saved under that account.
          </p>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-700">Marketplace</span>
            <select
              value={marketplace}
              onChange={(event) => {
                setMarketplace(event.target.value);
                const nextAccount = accounts.find((account) => account.active && account.marketplace === event.target.value);
                setChosenAccountId(nextAccount?.id ?? "");
              }}
              className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
            >
              {marketplaceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-700">Seller account</span>
            <select
              name="accountPicker"
              value={accountId}
              disabled={filteredAccounts.length === 0}
              onChange={(event) => setChosenAccountId(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
            >
              {filteredAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {accountLabel(account)} / {accountCode(account)}
                </option>
              ))}
              {filteredAccounts.length === 0 ? <option value="">No active account for this marketplace</option> : null}
            </select>
          </label>

          <div className="mt-4 rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-600">
            {marketplace === "FLIPKART"
              ? "Flipkart imports use Listing Master for product images and Daily Orders for worker tasks."
              : marketplace === "MEESHO"
                ? "Legacy PDF parser for old Meesho label/manifest workflow. Use only if you still process Meesho PDFs."
                : "Amazon import is planned for a later phase."}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {marketplace === "FLIPKART" ? (
          <>
            <form action={listingAction} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
              <input type="hidden" name="importKind" value="flipkart-listing" />
              <input type="hidden" name="accountId" value={accountId} />
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Flipkart</p>
              <h2 className="text-lg font-black text-slate-950">Flipkart Listing Master</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Upload this only when new products are listed or title, price, image, or listing status changes. This creates/updates the product master database.
              </p>
              <label className="mt-4 block">
                <span className="text-sm font-medium text-slate-700">Listing Master Excel</span>
                <input
                  name="mappingFile"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  required
                  className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                />
              </label>
              <div className="mt-4">
                <SubmitButton pendingText="Creating import job...">Import Listing Master</SubmitButton>
              </div>
            </form>

            <form action={flipkartOrdersAction} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
              <input type="hidden" name="accountId" value={accountId} />
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Flipkart</p>
              <h2 className="text-lg font-black text-slate-950">Flipkart Daily Orders</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Daily workers upload this order file. The app matches each SKU with Listing Master and creates pick/pack work.
              </p>
              <label className="mt-4 block">
                <span className="text-sm font-medium text-slate-700">Daily Orders Excel or CSV</span>
                <input
                  name="flipkartOrderExcel"
                  type="file"
                  accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  required
                  className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                />
                <span className="mt-2 block text-sm text-slate-500">Uses Tracking ID for packing scans and ORDER ITEM ID for duplicate protection.</span>
              </label>
              <div className="mt-4">
                <SubmitButton pendingText="Creating import job...">Import Daily Orders</SubmitButton>
              </div>
            </form>
          </>
        ) : null}

        {marketplace === "MEESHO" ? (
          <details className="rounded-md border border-slate-200 bg-white shadow-sm" open>
            <summary className="cursor-pointer px-5 py-4 text-base font-black text-slate-950">Advanced / Legacy imports</summary>
            <form action={legacyPdfAction} className="space-y-4 border-t border-slate-200 p-5">
              <input type="hidden" name="accountId" value={accountId} />
              <div className="rounded-md bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                Legacy PDF parser for old Meesho label/manifest workflow. Use only if you still process Meesho PDFs.
              </div>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Label PDF</span>
                <input
                  name="labelPdf"
                  type="file"
                  accept="application/pdf,.pdf"
                  className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Manifest/Picklist PDF</span>
                <input
                  name="manifestPdf"
                  type="file"
                  accept="application/pdf,.pdf"
                  className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                />
              </label>
              <SubmitButton pendingText="Parsing PDFs...">Parse legacy PDFs</SubmitButton>
            </form>
          </details>
        ) : null}

        {marketplace === "AMAZON" ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-white p-5 text-sm leading-6 text-slate-600">
            <h2 className="text-lg font-black text-slate-950">Amazon coming soon</h2>
            <p className="mt-2">Amazon imports are disabled in this phase. Add seller accounts now, then enable Amazon import types later.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
