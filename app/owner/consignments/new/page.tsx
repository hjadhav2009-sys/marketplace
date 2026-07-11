import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount } from "@/lib/auth";
import { requireConsignmentAccess } from "@/lib/consignment-auth";
import { uploadConsignmentAction } from "../actions";

export default async function NewConsignmentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireConsignmentAccess("import");
  const account = await requireAccount(user);
  const params = await searchParams;
  return <AppShell><PageHeader eyebrow="Flipkart consignment" title="Upload and preview" description="No work tasks are created until an authorized owner or manager activates the reviewed batch." />
    {params.error ? <div className="mb-4 rounded-md bg-rose-50 p-3 text-sm font-bold text-rose-700">{params.error}</div> : null}
    <form action={uploadConsignmentAction} className="mx-auto max-w-2xl space-y-4 rounded-md border bg-white p-5 shadow-sm">
      <div className="rounded-md bg-slate-50 p-3 text-sm"><p className="font-bold">{account.accountDisplayName ?? account.name} / {account.marketplace}</p><p className="text-slate-600">Quantity Sent becomes required work quantity. Quantity Received and QC columns do not create stock or QC workflows.</p></div>
      <label className="block text-sm font-bold">Consignment number<input name="externalConsignmentNumber" required maxLength={100} className="mt-1 min-h-11 w-full rounded-md border px-3" /></label>
      <label className="block text-sm font-bold">Display name<input name="displayName" maxLength={160} placeholder="Optional team-friendly name" className="mt-1 min-h-11 w-full rounded-md border px-3" /></label>
      <label className="block text-sm font-bold">Destination/reference<textarea name="destinationText" maxLength={500} className="mt-1 min-h-24 w-full rounded-md border p-3" /></label>
      <label className="block text-sm font-bold">Consignment CSV or ZIP<input name="file" type="file" accept=".csv,.zip,.txt" required className="mt-1 block min-h-11 w-full rounded-md border p-2" /></label>
      <p className="text-xs text-slate-500">ZIP may include Labels.csv, Quality_Check_*.csv, and README.txt. These are private references only and create no workflow actions.</p>
      <SubmitButton pendingText="Parsing safely...">Create preview</SubmitButton>
    </form>
  </AppShell>;
}
