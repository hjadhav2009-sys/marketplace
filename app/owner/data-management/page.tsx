import { randomUUID } from "node:crypto";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DataActionDetails, type DataActionTone } from "@/components/DataActionDetails";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { getSelectedAccount, requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import {
  dataManagementInventory,
  dataManagementOverview,
  type DataActionKind
} from "@/src/lib/data-management/service";
import { executeOwnerDataAction } from "./actions";

const tabs = [
  ["overview", "Overview"],
  ["files", "Uploaded Source Files"],
  ["imports", "Import Jobs"],
  ["operational", "Operational Test Data"],
  ["catalog", "Product Inventory Data"],
  ["trash", "Trash / Quarantine"],
  ["history", "Deletion History"],
  ["reset", "Full Reset Guidance"]
] as const;

function DestructiveForm(props: {
  actionKind: DataActionKind;
  tab: string;
  phrase: string;
  scope: Record<string, string>;
  button: string;
  disabled?: boolean;
}) {
  const tone = dataActionTone(props.actionKind);
  const disabledReason = "Unavailable while the record is active, processing, not retained, or inside its required retention window.";
  return <DataActionDetails label={props.button} tone={tone} disabled={props.disabled} disabledReason={disabledReason}>
    <form action={executeOwnerDataAction} className="space-y-3">
    <input type="hidden" name="actionKind" value={props.actionKind}/>
    <input type="hidden" name="returnTab" value={props.tab}/>
    <input type="hidden" name="clientRequestId" value={`dm-${randomUUID()}`}/>
    {Object.entries(props.scope).map(([name, value]) => <input key={name} type="hidden" name={name} value={value}/>)}
    <p className="text-sm text-slate-700">This action is scoped and single-use. Re-enter the current owner password and type <strong className="break-all">{props.phrase}</strong>.</p>
    <label className="block text-sm font-bold text-slate-800">Owner password
      <input name="ownerPassword" type="password" autoComplete="current-password" required disabled={props.disabled} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3"/>
    </label>
    <label className="block text-sm font-bold text-slate-800">Confirmation phrase
      <input name="confirmationPhrase" required disabled={props.disabled} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3" aria-describedby={`phrase-${props.actionKind}`}/>
    </label>
    <button className={`min-h-11 w-full rounded-lg px-4 py-2 font-bold text-white sm:w-auto ${dataActionButtonClass(tone)}`}>{props.button}</button>
    </form>
  </DataActionDetails>;
}

function dataActionTone(actionKind: DataActionKind): DataActionTone {
  if (actionKind === "RESTORE_QUARANTINED_FILES") return "restore";
  if (actionKind === "ARCHIVE_LISTING") return "archive";
  if (actionKind === "PURGE_QUARANTINED_FILES" || actionKind === "PURGE_QA_OPERATIONAL_DATA" || actionKind === "DELETE_UNREFERENCED_LISTING") return "permanent";
  return "quarantine";
}

function dataActionButtonClass(tone: DataActionTone) {
  if (tone === "restore") return "bg-emerald-700 hover:bg-emerald-800";
  if (tone === "archive") return "bg-sky-700 hover:bg-sky-800";
  if (tone === "permanent") return "bg-rose-700 hover:bg-rose-800";
  return "bg-amber-700 hover:bg-amber-800";
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">{children}</section>;
}

export default async function DataManagementPage({ searchParams }: {
  searchParams: Promise<{ tab?: string; error?: string; success?: string }>
}) {
  const user = await requireUser(["OWNER"]);
  const account = await getSelectedAccount(user);
  const query = await searchParams;
  const tab = tabs.some(([key]) => key === query.tab) ? query.tab! : "overview";
  const [overview, inventory] = await Promise.all([
    dataManagementOverview(user.id, account?.id),
    dataManagementInventory(user.id, account?.id)
  ]);

  return <AppShell allowNoAccount>
    <PageHeader eyebrow="Owner-only safety controls" title="Data Management" description="Preview, quarantine, restore, and explicitly purge controlled data. Normal worker history is never removed from this page."/>
    {query.error ? <p role="alert" tabIndex={-1} autoFocus className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">{query.error}</p> : null}
    {query.success ? <p role="status" tabIndex={-1} autoFocus className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-800">The authorized action completed. Review Deletion History for its durable receipt.</p> : null}
    <p className="mb-1 text-xs font-semibold text-slate-500 sm:hidden">Swipe to see all data sections →</p>
    <nav aria-label="Data management sections" className="mb-5 flex gap-2 overflow-x-auto pb-2">
      {tabs.map(([key, label]) => <Link key={key} href={`/owner/data-management?tab=${key}`} aria-current={tab===key?"page":undefined} className={`min-h-11 shrink-0 rounded-md border px-3 py-2 text-sm font-bold ${tab === key ? "border-slate-950 bg-slate-950 text-white" : "bg-white text-slate-700"}`}>{label}</Link>)}
    </nav>

    {!account && !["overview", "history", "reset"].includes(tab) ? <Card><h2 className="text-lg font-bold">Choose a seller account</h2><p className="mt-2 text-slate-600">Account-scoped data is shown only after the owner selects an account.</p><Link href="/accounts" className="mt-4 inline-flex min-h-11 items-center rounded-md bg-slate-950 px-4 py-2 font-bold text-white">Choose seller account</Link></Card> : null}

    {tab === "overview" ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[["Seller accounts", overview.accounts], ["Import jobs", overview.imports], ["Managed source files", overview.files], ["Product listings", overview.listings]].map(([label, value]) => <Card key={label}><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></Card>)}
      <div className="sm:col-span-2 xl:col-span-4"><Card><h2 className="text-lg font-bold">Safety boundary</h2><p className="mt-2 text-slate-600">Every destructive action requires a fresh owner-password check, a scope-bound one-use authorization, an exact typed phrase, and a durable receipt. Files enter quarantine before database metadata changes.</p></Card></div>
    </div> : null}

    {tab === "files" && account ? <div className="space-y-4">
      <Card><h2 className="text-xl font-bold">Retained import source files</h2><p className="mt-1 text-sm text-slate-600">File-only quarantine preserves the import-job record and its safe counters.</p></Card>
      {inventory.imports.filter(job => job.filePath).map(job => <Card key={`source-${job.id}`}><h3 className="font-bold break-all">{job.fileName}</h3><div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600"><span>{job.importType}</span><StatusBadge value={job.status}/></div><DestructiveForm actionKind="QUARANTINE_IMPORT_SOURCE_FILE" tab="files" phrase={`QUARANTINE ${job.id}`} scope={{importJobId:job.id}} button="Quarantine source file only" disabled={["QUEUED","RUNNING","PARSING","MERGING","NEEDS_MAPPING","AWAITING_FILE_ROLES"].includes(job.status)}/></Card>)}
      <Card><h2 className="text-xl font-bold">Consignment source files</h2><p className="mt-1 text-sm text-slate-600">Current source files for actionable batches are blocked.</p></Card>
      {inventory.consignmentFiles.map(file => <Card key={file.id}><h3 className="font-bold break-all">{file.originalFileName}</h3><p className="mt-1 text-sm text-slate-600">{file.consignmentBatch.displayName} · {file.fileSizeBytes.toLocaleString()} bytes · {file.managedRelativePath ? "retained" : "absent"}</p><DestructiveForm actionKind="QUARANTINE_CONSIGNMENT_FILE" tab="files" phrase={`QUARANTINE ${file.id}`} scope={{consignmentFileId:file.id}} button="Quarantine source file" disabled={!file.managedRelativePath || (file.isCurrentSource && ["ACTIVE","READY_TO_ACTIVATE"].includes(file.consignmentBatch.status))}/></Card>)}
      {!inventory.consignmentFiles.length ? <Card><p>No managed Consignment source files exist for this account.</p></Card> : null}
    </div> : null}

    {tab === "imports" && account ? <div className="space-y-4">
      {inventory.imports.map(job => <Card key={job.id}><h2 className="font-bold break-all">{job.fileName}</h2><div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600"><span>{job.importType}</span><StatusBadge value={job.status}/><span>Created {formatDateTime(job.createdAt)}</span></div><DestructiveForm actionKind="QUARANTINE_IMPORT_JOB_FILE" tab="imports" phrase={`QUARANTINE ${job.id}`} scope={{importJobId:job.id}} button="Archive job and quarantine retained artifact" disabled={!job.filePath || ["QUEUED","RUNNING","PARSING","MERGING","NEEDS_MAPPING","AWAITING_FILE_ROLES"].includes(job.status)}/><DestructiveForm actionKind="QUARANTINE_GENERATED_REPORTS" tab="imports" phrase={`QUARANTINE ${job.id}`} scope={{importJobId:job.id}} button="Quarantine generated reports" disabled={!job.filePath || ["QUEUED","RUNNING","PARSING","MERGING","NEEDS_MAPPING","AWAITING_FILE_ROLES"].includes(job.status)}/></Card>)}
      {!inventory.imports.length ? <Card><p>No import jobs exist for this account.</p></Card> : null}
    </div> : null}

    {tab === "operational" && account ? <Card><h2 className="text-xl font-bold">Bounded QA operational purge</h2><p className="mt-2 text-slate-600">Available only for accounts whose code starts with QA- or STAGE-. It removes Orders, Consignments, tasks, projections, imports, and scans while preserving Product Inventory, account access, deletion history, and audit evidence.</p><DestructiveForm actionKind="PURGE_QA_OPERATIONAL_DATA" tab="operational" phrase={`PURGE QA DATA ${account.id}`} scope={{accountId:account.id}} button="Purge QA operational data" disabled={!/^(QA|STAGE)-/i.test(account.code)}/></Card> : null}

    {tab === "catalog" && account ? <div className="space-y-4">
      <Card><h2 className="text-xl font-bold">Regenerable image cache</h2><p className="mt-2 text-slate-600">Quarantine cached image files while retaining marketplace image URLs and listing data.</p><DestructiveForm actionKind="CLEAR_IMAGE_CACHE" tab="catalog" phrase={`QUARANTINE ${account.id}`} scope={{accountId:account.id}} button="Quarantine image cache"/></Card>
      {inventory.listings.map(listing => {
        const references = listing._count.consignmentLines + listing._count.processRules + listing._count.markingAssetLinks;
        return <Card key={listing.id}><h2 className="font-bold break-all">{listing.sellerSkuId}</h2><p className="mt-1 text-sm text-slate-600">{listing.productTitle || "Untitled listing"} · {listing.listingStatus || "No status"} · {references} active reference(s)</p><DestructiveForm actionKind="ARCHIVE_LISTING" tab="catalog" phrase={`ARCHIVE ${listing.id}`} scope={{marketplaceListingId:listing.id}} button="Archive listing"/>{references === 0 ? <DestructiveForm actionKind="DELETE_UNREFERENCED_LISTING" tab="catalog" phrase={`DELETE ${listing.id}`} scope={{marketplaceListingId:listing.id}} button="Delete unreferenced listing"/> : null}</Card>;
      })}
      {!inventory.listings.length ? <Card><p>No Product Inventory listings exist for this account.</p></Card> : null}
    </div> : null}

    {tab === "trash" ? <div className="space-y-4">{overview.jobs.filter(job => ["COMPLETED","FAILED_RESTORED"].includes(job.state) && job.totalFiles > 0).map(job => <Card key={job.id}><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold">{job.actionKind.replaceAll("_"," ")}</h2><StatusBadge value={job.state}/></div><p className="mt-1 text-sm text-slate-600">{job.totalFiles} files · {job.totalBytes.toLocaleString()} bytes · retained until {job.purgeAfter ? formatDateTime(job.purgeAfter) : "manual review"}</p>{job.state === "COMPLETED" ? <DestructiveForm actionKind="RESTORE_QUARANTINED_FILES" tab="trash" phrase={`RESTORE ${job.id}`} scope={{deletionJobId:job.id}} button="Restore quarantined files"/> : null}<DestructiveForm actionKind="PURGE_QUARANTINED_FILES" tab="trash" phrase={`PERMANENTLY PURGE ${job.id}`} scope={{deletionJobId:job.id}} button="Permanently purge after retention" disabled={!job.purgeAfter || job.purgeAfter > new Date()}/></Card>)}{!overview.jobs.some(job => job.totalFiles > 0) ? <Card><p>Trash / Quarantine is empty. Quarantined files will appear here with their retention deadline.</p></Card> : null}</div> : null}

    {tab === "history" ? <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-100"><tr><th className="p-3">Created</th><th className="p-3">Action</th><th className="p-3">State</th><th className="p-3">Files</th><th className="p-3">Retention</th></tr></thead><tbody>{overview.jobs.map(job => <tr key={job.id} className="border-t"><td className="p-3">{formatDateTime(job.createdAt)}</td><td className="p-3 font-semibold">{job.actionKind.replaceAll("_"," ")}</td><td className="p-3"><StatusBadge value={job.state}/></td><td className="p-3">{job.totalFiles} files</td><td className="p-3">{job.purgeAfter ? formatDateTime(job.purgeAfter) : "Not scheduled"}</td></tr>)}</tbody></table>{!overview.jobs.length?<p className="p-6 text-center text-sm text-slate-600">No deletion actions have been recorded.</p>:null}</div> : null}

    {tab === "reset" ? <div className="space-y-4"><Card><h2 className="text-xl font-bold">Full reset is CLI-only</h2><p className="mt-2 text-slate-600">This page never runs a full database reset. Follow the guarded fresh-start runbook from a stopped application, verified backup, and explicit owner authorization.</p><Link href="/owner/system" className="mt-4 inline-flex min-h-11 items-center rounded-md border px-4 py-2 font-bold">Open System guidance</Link></Card><Card><h2 className="text-xl font-bold">Seller account deletion</h2><p className="mt-2 text-slate-600">Account lifecycle checks remain in the existing account-management service; Data Management does not bypass them.</p><Link href="/owner/accounts" className="mt-4 inline-flex min-h-11 items-center rounded-md border px-4 py-2 font-bold">Manage seller accounts</Link></Card></div> : null}
  </AppShell>;
}
