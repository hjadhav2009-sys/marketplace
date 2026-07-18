import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ImportJobProgress } from "@/components/ImportJobProgress";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { retainedImportJobFileExists } from "@/src/lib/import-jobs/runner";
import { toPublicImportJob } from "@/src/lib/import-jobs/public-job";
import { findImportJobById } from "@/src/lib/import-jobs/store";
import { retainedProductInventoryJobDirectoryExists } from "@/src/lib/product-inventory/jobs";
import { cancelProductInventoryJobAction, retryImportJobAction, retryProductInventoryJobAction } from "./actions";

type ImportJobPageProps = {
  params: Promise<{
    jobId: string;
  }>;
  searchParams?: Promise<{
    retry?: string;
  }>;
};

export default async function ImportJobPage({ params, searchParams }: ImportJobPageProps) {
  await requireUser(["OWNER"]);
  const { jobId } = await params;
  const query = await searchParams;
  const job = await findImportJobById(jobId);

  if (!job) {
    notFound();
  }

  const account = await prisma.account.findFirst({ where: { id: job.accountId, active: true }, select: { name: true, accountDisplayName: true, marketplace: true } });

  const productInventoryJob = job.importType.endsWith("PRODUCT_INVENTORY");
  const staleProductInventoryRun = productInventoryJob && job.status === "RUNNING" && (!job.leaseExpiresAt || job.leaseExpiresAt.getTime() < Date.now());
  const canRetry = !productInventoryJob && (job.status === "FAILED" || job.status === "CANCELLED") && (await retainedImportJobFileExists(job.filePath));
  const canRetryProductInventory = productInventoryJob && (job.status === "FAILED" || staleProductInventoryRun) && (await retainedProductInventoryJobDirectoryExists(job.filePath));
  const issueCount = job.errorRows + job.warningRows + job.missingListingRows + job.missingImageRows;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Import Progress"
        title={job.importType.endsWith("PRODUCT_INVENTORY")?"Product Inventory Refresh":"Flipkart import job"}
        description="Keep this owner PC running while the job processes. The page refreshes progress without rendering the whole file."
      >
        <StatusBadge value={job.status} />
      </PageHeader>

      {query?.retry === "file-missing" ? (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          Retry unavailable because source file was cleaned up.
        </div>
      ) : query?.retry === "started" ? (
        <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
          Retry job started.
        </div>
      ) : null}

      <ImportJobProgress initialJob={toPublicImportJob(job)} accountLabel={account?.accountDisplayName ?? account?.name ?? "Unavailable account"} />

      <section className="mt-5 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-950">Issue and retry actions</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          View issue rows without exposing private raw order/customer data. Retry is available only while the retained upload file still exists.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {job.status === "NEEDS_MAPPING" ? <a href={`/owner/imports/${job.id}/mapping`} className="rounded-md bg-berry px-3 py-2 text-sm font-bold text-white">Map File Headers</a> : null}
          {issueCount > 0 && job.batchId ? <a href={`/owner/imports/${job.id}/issues`} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800">View issues ({issueCount})</a> : <span className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-bold text-teal-800">No issues</span>}
          {issueCount > 0 && job.batchId ? <a href={`/owner/imports/export?jobId=${encodeURIComponent(job.id)}&format=csv&type=issues`} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800">Download issues</a> : null}
          {canRetry ? (
            <form action={retryImportJobAction}>
              <input type="hidden" name="jobId" value={job.id} />
              <button className="rounded-md bg-slate-950 px-3 py-2 text-sm font-bold text-white">Retry import</button>
            </form>
          ) : canRetryProductInventory ? (
            <form action={retryProductInventoryJobAction}>
              <input type="hidden" name="jobId" value={job.id} />
              <button className="rounded-md bg-slate-950 px-3 py-2 text-sm font-bold text-white">Resume Product Inventory</button>
            </form>
          ) : productInventoryJob && job.status === "CANCELLED" ? (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
              Cancelled Product Inventory jobs require a new upload.
            </span>
          ) : job.status === "FAILED" || job.status === "CANCELLED" ? (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
              Retry unavailable because source file was cleaned up.
            </span>
          ) : null}
          {job.importType.endsWith("PRODUCT_INVENTORY") && ["QUEUED","RUNNING"].includes(job.status) && !staleProductInventoryRun ? <form action={cancelProductInventoryJobAction}><input type="hidden" name="jobId" value={job.id}/><button className="rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-700">Cancel import safely</button></form>:null}
        </div>
      </section>
    </AppShell>
  );
}
