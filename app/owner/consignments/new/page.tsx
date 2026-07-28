import { AppShell } from "@/components/AppShell";
import { FileUploadField } from "@/components/FileUploadField";
import { PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount } from "@/lib/auth";
import { requireConsignmentAccess } from "@/lib/consignment-auth";
import { uploadConsignmentAction } from "../actions";

export default async function NewConsignmentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireConsignmentAccess("import");
  const account = await requireAccount(user);
  const params = await searchParams;
  const amazon=account.marketplace==="AMAZON";
  return <AppShell><PageHeader eyebrow={`${account.marketplace} consignment`} title="Upload and preview" description="No work tasks are created until an authorized owner or manager activates the reviewed batch." />
    {params.error ? <div className="mb-4 rounded-md bg-rose-50 p-3 text-sm font-bold text-rose-700">{params.error}</div> : null}
    <form action={uploadConsignmentAction} className="mx-auto max-w-2xl space-y-4 rounded-md border bg-white p-5 shadow-sm">
      <div className="rounded-md bg-slate-50 p-3 text-sm"><p className="font-bold">{account.accountDisplayName ?? account.name} / {account.marketplace}</p><p className="text-slate-600">{amazon?"Shipment quantity becomes worker-processing quantity. Catalog stock values are ignored.":"Quantity Sent becomes required work quantity. Quantity Received and QC columns do not create stock or QC workflows."}</p></div>
      <label className="block text-sm font-bold">Consignment number <span className="text-rose-700" aria-hidden="true">*</span><span className="sr-only"> (required)</span><input name="externalConsignmentNumber" required maxLength={100} className="mt-1 min-h-11 w-full rounded-md border px-3" /></label>
      <label className="block text-sm font-bold">Display name<input name="displayName" maxLength={160} placeholder="Optional team-friendly name" className="mt-1 min-h-11 w-full rounded-md border px-3" /></label>
      <label className="block text-sm font-bold">Destination/reference<textarea name="destinationText" maxLength={500} className="mt-1 min-h-24 w-full rounded-md border p-3" /></label>
      <FileUploadField
        name="file"
        label={amazon ? "Amazon shipment, listings, catalog files, or ZIP" : "Consignment CSV or ZIP"}
        multiple={amazon}
        accept={amazon ? ".csv,.tsv,.txt,.xlsx,.xlsm,.zip" : ".csv,.zip,.txt"}
        required
        hint={amazon
          ? "Accepted: CSV, TSV, TXT, XLSX, XLSM, or ZIP. Classification uses header signatures, not filenames. Workbook formulas and macros are never executed."
          : "Accepted: CSV, ZIP, or TXT. A ZIP may contain Labels.csv, Quality_Check_*.csv, and README.txt as private references; they create no workflow actions."}
      />
      <aside className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
        <p className="font-black">Safe upload sequence</p>
        <p>Upload creates a private draft and parse preview first. No worker tasks are created until an authorized owner or manager reviews and activates the batch.</p>
      </aside>
      <SubmitButton pendingText="Parsing safely...">Create preview</SubmitButton>
    </form>
  </AppShell>;
}
