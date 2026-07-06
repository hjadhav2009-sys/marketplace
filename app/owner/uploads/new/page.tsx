import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { getAvailableAccounts, requireAccount, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { importSkuMappingFileAction } from "@/app/owner/sku-mappings/import/actions";
import { createFlipkartOrderImportAction, createUploadBatchAction } from "../actions";

type UploadPageProps = {
  searchParams?: Promise<{
    error?: string;
    flipkartBatchId?: string;
  }>;
};

function errorText(error: string | undefined) {
  if (error === "account") {
    return "Choose a valid seller account.";
  }

  if (error === "missing-file") {
    return "Upload a legacy Meesho label PDF, manifest PDF, or both.";
  }

  if (error === "missing-flipkart-orders") {
    return "Upload a Flipkart Daily Orders Excel or CSV file.";
  }

  if (error === "invalid-flipkart-orders") {
    return "Choose a valid Flipkart .xlsx or .csv order export.";
  }

  if (error === "flipkart-order-import-failed") {
    return "The Flipkart order file could not be imported. Check the headers and try again.";
  }

  if (error === "too-large") {
    return "The PDF upload is larger than 100 MB. Split the marketplace download into smaller files and upload again.";
  }

  if (error === "parse-failed") {
    return "The PDF could not be parsed. Use text-based PDFs only; scanned image PDFs need OCR in a later phase.";
  }

  return error ? "Choose a valid marketplace import file." : null;
}

export default async function UploadBatchPage({ searchParams }: UploadPageProps) {
  const user = await requireUser(["OWNER"]);
  const selectedAccount = await requireAccount(user);
  const accounts = await getAvailableAccounts(user);
  const params = await searchParams;
  const flipkartBatch = params?.flipkartBatchId
    ? await prisma.uploadBatch.findFirst({
        where: {
          id: params.flipkartBatchId,
          accountId: selectedAccount.id
        }
      })
    : null;
  const errorMessage = errorText(params?.error);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Import"
        title="Upload marketplace files"
        description="Use Flipkart imports for the normal daily workflow. Legacy PDF imports are kept under Advanced."
      />

      {flipkartBatch ? (
        <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
          Flipkart order import finished: {flipkartBatch.createdRows} created, {flipkartBatch.updatedRows} updated,{" "}
          {flipkartBatch.duplicateRows} duplicate, {flipkartBatch.missingImageRows} missing image mapping, {flipkartBatch.errorRows} held for review.{" "}
          <Link href={`/owner/uploads/${flipkartBatch.id}/review`} className="underline">
            Open review
          </Link>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-4">
          <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected marketplace</p>
            <div className="mt-3 grid gap-2">
              <div className="rounded-md border border-slate-950 bg-slate-950 px-3 py-3 text-sm font-bold text-white">
                Flipkart
              </div>
              <details className="rounded-md border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                <summary className="cursor-pointer font-bold text-slate-900">Advanced / Legacy imports</summary>
                <p className="mt-2 leading-6">
                  Meesho legacy PDF parser is for old label/manifest workflows. Use only if you still process Meesho PDFs.
                </p>
              </details>
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500">
                Amazon coming soon
              </div>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seller account</p>
            <p className="mt-2 text-lg font-black text-slate-950">{selectedAccount.name}</p>
            <p className="mt-1 text-sm text-slate-600">Imports are stored inside the selected seller account.</p>
            <Link prefetch href="/accounts" className="mt-3 inline-flex rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800">
              Switch account
            </Link>
          </div>
        </div>

        <div className="space-y-5">
          <form action={importSkuMappingFileAction} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <input type="hidden" name="importKind" value="flipkart-listing" />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Flipkart</p>
                <h2 className="text-lg font-black text-slate-950">Flipkart Listing Master</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Upload this only when new products are listed or title, price, image, or listing status changes. This creates/updates the product master database.
                </p>
              </div>
              <select
                name="accountId"
                required
                defaultValue={selectedAccount.id}
                className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
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

          <form action={createFlipkartOrderImportAction} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Flipkart</p>
                <h2 className="text-lg font-black text-slate-950">Flipkart Daily Orders</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Daily workers upload this order file. The app matches each SKU with Listing Master and creates pick/pack work.
                </p>
              </div>
              <select
                name="accountId"
                required
                defaultValue={selectedAccount.id}
                className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
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

          <details className="rounded-md border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer px-5 py-4 text-base font-black text-slate-950">Advanced / Legacy imports</summary>
            <form action={createUploadBatchAction} className="space-y-4 border-t border-slate-200 p-5">
              <input type="hidden" name="accountId" value={selectedAccount.id} />
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
        </div>
      </section>
    </AppShell>
  );
}
