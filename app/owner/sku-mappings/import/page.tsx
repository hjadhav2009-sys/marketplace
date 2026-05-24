import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { getAvailableAccounts, requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { importSkuMappingFileAction } from "./actions";

type ImportPageProps = {
  searchParams?: Promise<{
    batchId?: string;
    error?: string;
  }>;
};

export default async function SkuMappingImportPage({ searchParams }: ImportPageProps) {
  const user = await requireUser(["OWNER"]);
  const params = await searchParams;
  const accounts = await getAvailableAccounts(user);
  const batch = params?.batchId
    ? await prisma.uploadBatch.findFirst({
        where: { id: params.batchId, importType: "SKU_IMAGE" },
        include: {
          issues: { orderBy: { createdAt: "asc" } },
          account: true
        }
      })
    : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow="SKU Import"
        title="Import SKU image mappings"
        description="Upload a CSV or .xlsx file with SKU and image URL columns. Existing mappings are updated by account and SKU."
      />

      {params?.error ? (
        <div className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Could not import that file. Check the account, file type, and required columns.
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <form action={importSkuMappingFileAction} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Upload file</h2>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Account</span>
              <select
                name="accountId"
                required
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
            <div className="rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              Required columns: <span className="font-semibold">sku</span>,{" "}
              <span className="font-semibold">image_url</span>. Optional columns: account, product_name, notes,
              active.
            </div>
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
                {batch.account.name} · {formatDateTime(batch.createdAt)}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  ["Created", batch.createdRows],
                  ["Updated", batch.updatedRows],
                  ["Unchanged", batch.skippedRows],
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
                {batch.issues.length > 0 ? (
                  <Link
                    href={`/owner/sku-mappings/import/${batch.id}/errors`}
                    className="text-sm font-semibold text-berry hover:text-pink-800"
                  >
                    Download error CSV
                  </Link>
                ) : null}
              </div>

              {batch.issues.length > 0 ? (
                <div className="mt-5 overflow-hidden rounded-md border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Issue</th>
                        <th className="px-3 py-2">Message</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {batch.issues.map((issue) => (
                        <tr key={issue.id}>
                          <td className="px-3 py-2">{issue.rowNumber ?? "-"}</td>
                          <td className="px-3 py-2 font-semibold text-slate-950">{issue.issueType}</td>
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
