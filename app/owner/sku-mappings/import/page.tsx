import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { FormPendingStatus } from "@/components/FormPendingStatus";
import { PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { getAvailableAccounts, requireAccount, requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { flipkartIssueRawContext } from "@/src/lib/marketplaces/flipkart";
import { importSkuMappingFileAction } from "./actions";

type ImportPageProps = {
  searchParams?: Promise<{
    batchId?: string;
    error?: string;
  }>;
};

type ImportNotes = {
  marketplace?: string;
  listingMaster?: boolean;
  inactiveListings?: number;
  selectedAccount?: {
    name?: string;
    code?: string;
  };
  importAllAccounts?: boolean;
};

type FlipkartListingStats = {
  active: number | null;
  latestImportAt: Date | null;
  missingImages: number | null;
  total: number | null;
};

async function safeStat<T>(query: () => Promise<T>, fallback: T) {
  try {
    return await query();
  } catch {
    return fallback;
  }
}

async function getFlipkartListingStats(accountId: string): Promise<FlipkartListingStats> {
  const total = await safeStat(
    () =>
      prisma.marketplaceListing.count({
        where: { accountId, marketplace: "FLIPKART" }
      }),
    null
  );
  const active = await safeStat(
    () =>
      prisma.marketplaceListing.count({
        where: { accountId, marketplace: "FLIPKART", listingStatus: "Active" }
      }),
    null
  );
  const missingImages = await safeStat(
    () =>
      prisma.marketplaceListing.count({
        where: { accountId, marketplace: "FLIPKART", mainImageUrl: null }
      }),
    null
  );
  const latestListing = await safeStat(
    () =>
      prisma.marketplaceListing.findFirst({
        where: { accountId, marketplace: "FLIPKART", lastImportedAt: { not: null } },
        select: { lastImportedAt: true },
        orderBy: { lastImportedAt: "desc" }
      }),
    null
  );

  return {
    active,
    latestImportAt: latestListing?.lastImportedAt ?? null,
    missingImages,
    total
  };
}

function parseImportNotes(value: string | null): ImportNotes {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? (parsed as ImportNotes) : {};
  } catch {
    return {};
  }
}

function parseIssueRawData(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export default async function SkuMappingImportPage({ searchParams }: ImportPageProps) {
  const user = await requireUser(["OWNER"]);
  const selectedAccount = await requireAccount(user);
  const params = await searchParams;
  const accounts = await getAvailableAccounts(user);
  const listingStats = await getFlipkartListingStats(selectedAccount.id);
  const statsAreRefreshing = [listingStats.total, listingStats.active, listingStats.missingImages].some((value) => value === null);
  const batch = params?.batchId
    ? await prisma.uploadBatch.findFirst({
        where: { id: params.batchId, importType: "SKU_IMAGE" },
        include: {
          issues: {
            orderBy: { createdAt: "asc" },
            take: 50
          },
          _count: {
            select: {
              issues: true
            }
          },
          account: true
        }
      })
    : null;
  const importNotes = parseImportNotes(batch?.notes ?? null);
  const issueRows =
    batch?.issues.map((issue) => ({
      ...issue,
      context: flipkartIssueRawContext(parseIssueRawData(issue.rawData))
    })) ?? [];
  const issueCount = batch?._count.issues ?? batch?.issues.length ?? 0;
  const hasFlipkartMissingImageIssues = issueRows.some((issue) => issue.issueType === "MISSING_IMAGE_URL" && issue.context.sku);

  return (
    <AppShell>
      <PageHeader
        eyebrow="SKU Import"
        title="Import SKU images / listings"
        description="Upload Flipkart listings or simple SKU image mappings for the selected account."
      />

      {params?.error ? (
        <div className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Could not import that file. Check the account, file type, and required columns.
        </div>
      ) : null}

      <section className="mb-6 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Flipkart Listing Master</h2>
            <p className="mt-1 text-sm text-slate-600">Import this only when listings, prices, statuses, images, or scraped product details change.</p>
          </div>
          <Link href="/owner/uploads/new" className="text-sm font-semibold text-berry hover:text-pink-800">
            Daily workers upload orders only
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Total listings", listingStats.total ?? "Refreshing"],
            ["Active listings", listingStats.active ?? "Refreshing"],
            ["Missing images", listingStats.missingImages ?? "Refreshing"],
            ["Last import", listingStats.latestImportAt ? formatDateTime(listingStats.latestImportAt) : statsAreRefreshing ? "Refreshing" : "Never"]
          ].map(([label, value]) => (
            <div key={label} className="rounded-md bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-1 break-words text-2xl font-bold text-slate-950">{value}</p>
            </div>
          ))}
        </div>
        {statsAreRefreshing ? (
          <p className="mt-3 text-sm font-medium text-amber-700">
            Listing counters are refreshing because the local SQLite database is busy. Imports and uploads can continue.
          </p>
        ) : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <form action={importSkuMappingFileAction} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Flipkart Listings</h2>
          <div className="mt-5 space-y-4">
            <input type="hidden" name="importKind" value="flipkart-listing" />
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Account</span>
              <select
                name="accountId"
                required
                defaultValue={selectedAccount.id}
                className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Flipkart Listing Excel</span>
              <input
                name="mappingFile"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required
                className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
              />
            </label>
            <div className="rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              Required column: <span className="font-semibold">Seller SKU Id</span>. Image priority uses Image 1 1366 URL, then Image URL 1.
            </div>
            <FormPendingStatus
              title="Uploading Flipkart listings"
              description="Large Listing Master files are saved first, then processed on the Import Progress page."
            />
            <SubmitButton pendingText="Importing...">Import Flipkart listings</SubmitButton>
          </div>
        </form>

        <form action={importSkuMappingFileAction} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Simple SKU image mappings</h2>
          <div className="mt-5 space-y-4">
            <input type="hidden" name="importKind" value="sku-image" />
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Account</span>
              <select
                name="accountId"
                required
                defaultValue={selectedAccount.id}
                className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">CSV or .xlsx file</span>
              <input
                name="mappingFile"
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required
                className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
              />
            </label>
            <label className="flex items-start gap-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              <input name="importAllAccounts" type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300" />
              <span>
                <span className="block font-semibold text-slate-900">Use account column for all accounts</span>
                <span className="mt-1 block text-slate-600">
                  Empty account cells still import into the selected account. Account values match by account name or code.
                </span>
              </span>
            </label>
            <div className="rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              Required columns: <span className="font-semibold">sku</span>,{" "}
              <span className="font-semibold">image_url</span>. Optional column: account for all-account imports.
            </div>
            <div className="flex flex-wrap gap-3 text-sm font-semibold">
              <Link href="/owner/sku-mappings/template?format=csv" className="text-berry hover:text-pink-800">
                Download CSV template
              </Link>
              <Link href="/owner/sku-mappings/template?format=xlsx" className="text-berry hover:text-pink-800">
                Download Excel template
              </Link>
            </div>
            <FormPendingStatus
              title="SKU mapping import is running"
              description="The file is uploading and importing. Keep this tab open until the import result appears."
            />
            <SubmitButton pendingText="Importing...">Import mappings</SubmitButton>
          </div>
        </form>

        <div className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Import result</h2>
          </div>
          {batch ? (
            <div className="p-4">
              <p className="font-semibold text-slate-950">{batch.fileName}</p>
              <p className="mt-1 text-sm text-slate-600">
                Selected account: {importNotes.selectedAccount?.name ?? batch.account.name} / {formatDateTime(batch.createdAt)}
              </p>
              {importNotes.importAllAccounts ? (
                <p className="mt-1 text-sm font-medium text-blue-700">Rows with an account column were imported account-wise.</p>
              ) : null}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ["Created", batch.createdRows],
                  ["Updated", batch.updatedRows],
                  ["Unchanged", batch.skippedRows],
                  ["Missing images", batch.missingImageRows],
                  ["Inactive", importNotes.inactiveListings ?? 0],
                  ["Errors", batch.errorRows],
                  ["Total", batch.totalRows]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md bg-slate-50 p-3 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/owner/sku-mappings" className="text-sm font-semibold text-berry hover:text-pink-800">
                  View mappings
                </Link>
                {issueCount > 0 ? (
                  <Link
                    href={`/owner/sku-mappings/import/${batch.id}/errors`}
                    className="text-sm font-semibold text-berry hover:text-pink-800"
                  >
                    {hasFlipkartMissingImageIssues ? "Download missing image CSV" : "Download error CSV"}
                  </Link>
                ) : null}
              </div>

              {issueCount > 0 ? (
                <div className="mt-5 overflow-hidden rounded-md border border-slate-200">
                  <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Showing {issueRows.length} of {issueCount} issue rows
                  </div>
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Issue</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2">Message</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {issueRows.map((issue) => (
                        <tr key={issue.id}>
                          <td className="px-3 py-2">{issue.rowNumber ?? "-"}</td>
                          <td className="px-3 py-2 font-semibold text-slate-950">{issue.issueType}</td>
                          <td className="px-3 py-2 font-semibold text-slate-950">{issue.context.sku ?? "-"}</td>
                          <td className="px-3 py-2 text-slate-600">{issue.context.product ?? "-"}</td>
                          <td className="px-3 py-2 text-slate-600">{issue.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                title="No import run selected"
                description="Upload a SKU mapping file to see created, updated, unchanged, and error counts here."
              />
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
