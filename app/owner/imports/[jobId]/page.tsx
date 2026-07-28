import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ImportJobProgress } from "@/components/ImportJobProgress";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { retainedImportJobFileExists } from "@/src/lib/import-jobs/runner";
import { toPublicImportJob } from "@/src/lib/import-jobs/public-job";
import { findImportJobById } from "@/src/lib/import-jobs/store";
import { retainedProductInventoryJobDirectoryExists, type CatalogJobManifest } from "@/src/lib/product-inventory/jobs";
import { cancelProductInventoryJobAction, confirmAmazonFileRolesAction, retryImportJobAction, retryProductInventoryJobAction } from "./actions";

type ImportJobPageProps = {
  params: Promise<{
    jobId: string;
  }>;
  searchParams?: Promise<{
    retry?: string;
    roles?: string;
    rolesError?: string;
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
  let roleManifest:CatalogJobManifest|null=null;
  if(job.status==="AWAITING_FILE_ROLES")try{const parsed=JSON.parse(job.manifestJson??"") as CatalogJobManifest;if(parsed.marketplace==="AMAZON"&&Array.isArray(parsed.entries))roleManifest=parsed;}catch{}

  return (
    <AppShell>
      <PageHeader
        eyebrow="Import Progress"
        title={job.importType.endsWith("PRODUCT_INVENTORY")?"Product Inventory Refresh":"Flipkart import job"}
        description="Keep this owner PC running while the job processes. The page refreshes progress without rendering the whole file."
      >
        <StatusBadge value={job.status} />
      </PageHeader>

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Import navigation"><Link href="/owner/imports" className="inline-flex min-h-11 items-center rounded-xl border bg-white px-4 py-2 font-bold">Back to imports</Link><Link href="/owner/product-inventory/refresh" className="inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 py-2 font-bold text-white">Start another import</Link></nav>

      {query?.rolesError?<div role="alert" tabIndex={-1} className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 font-bold text-rose-800">{query.rolesError}<p className="mt-1 text-xs">Support reference: IMP-{job.id.slice(0,8).toUpperCase()}</p></div>:query?.roles==="saved"?<div role="status" tabIndex={-1} className="mb-5 rounded-xl border border-teal-200 bg-teal-50 p-3 font-bold text-teal-800">File roles saved. Processing started.</div>:null}

      {roleManifest?<form action={confirmAmazonFileRolesAction} className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm"><input type="hidden" name="jobId" value={job.id}/><h2 className="text-xl font-black">Review Amazon file roles</h2><p className="mt-1 text-sm text-amber-950">Auto-detection is a suggestion. Confirm or correct each file before any catalog rows are processed.</p><div className="mt-4 grid gap-3">{roleManifest.entries.map(entry=><article key={entry.id} className="grid gap-3 rounded-xl border bg-white p-3 md:grid-cols-[minmax(0,1fr)_16rem] md:items-center"><div className="min-w-0"><p className="break-words font-black">{entry.displayName}</p><p className="mt-1 text-xs text-slate-600">Detected: {(entry.detectedRole??"AUTO_DETECT").replaceAll("_"," ")} · {entry.detectedProfile??"Unknown profile"} · {entry.detectedSheet??"Unknown sheet"} · {entry.detectedRows??0} source row(s)</p></div><label className="text-sm font-bold">File role <span className="text-rose-700" aria-hidden="true">*</span><span className="sr-only"> (required)</span><select name={`role_${entry.id}`} defaultValue={entry.detectedRole??"AUTO_DETECT"} required className="mt-1 min-h-11 w-full rounded-xl border bg-white px-3"><option value="AUTO_DETECT">Auto Detect</option><option value="ALL_LISTINGS_IDENTITY">All Listings / Identity</option><option value="CATEGORY_TEMPLATE">Category Template</option><option value="PRODUCT_CATALOG">Product Catalog</option><option value="SUPPORTING_ENRICHMENT">Supporting Enrichment</option><option value="REFERENCE_IGNORE">Reference / Ignore</option></select></label></article>)}</div><button className="mt-4 min-h-12 rounded-xl bg-berry px-5 font-black text-white">Confirm roles and start</button></form>:null}

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
          {job.importType.endsWith("PRODUCT_INVENTORY") && ["QUEUED","RUNNING"].includes(job.status) && !staleProductInventoryRun ? <form action={cancelProductInventoryJobAction} className="basis-full border-t border-slate-200 pt-3"><input type="hidden" name="jobId" value={job.id}/><p className="mb-2 text-xs text-slate-600">Cancellation is requested through the durable import runner. Open this page again to verify the final committed status.</p><button className="min-h-11 rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-700">Request safe cancellation</button></form>:null}
        </div>
      </section>
      <div className="mt-5"><Link href="/owner/imports" className="inline-flex min-h-11 items-center rounded-xl border bg-white px-4 font-bold">Back to Imports</Link></div>
    </AppShell>
  );
}
