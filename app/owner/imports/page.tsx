import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { requireAccount, requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { importJobProgressPercent } from "@/src/lib/import-jobs/progress";
import { listRecentImportJobs } from "@/src/lib/import-jobs/store";

function importTypeLabel(importType: string) {
  return importType === "FLIPKART_LISTING_MASTER" ? "Flipkart Listings" : "Flipkart Orders";
}

export default async function OwnerImportsPage() {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const jobs = await listRecentImportJobs(account.id, 30);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Owner"
        title="Import Progress"
        description="Large Flipkart imports run as jobs so the browser does not freeze while rows are processed."
      />

      <section className="rounded-md border border-slate-200 bg-white shadow-sm">
        {jobs.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No import jobs yet" description="Upload Flipkart Listings or Flipkart Orders to see live progress here." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Import</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Progress</th>
                  <th className="px-4 py-3">Rows</th>
                  <th className="px-4 py-3">Created / Updated</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="px-4 py-3">
                      <Link href={`/owner/imports/${job.id}`} className="font-semibold text-berry hover:text-pink-800">
                        {importTypeLabel(job.importType)}
                      </Link>
                      <p className="mt-1 max-w-xs truncate text-xs text-slate-500">{job.fileName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={job.status} />
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-950">{importJobProgressPercent(job)}%</td>
                    <td className="px-4 py-3">{job.processedRows} / {job.totalRows}</td>
                    <td className="px-4 py-3">{job.createdRows} / {job.updatedRows}</td>
                    <td className="px-4 py-3">{formatDateTime(job.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
