import { AppShell } from "@/components/AppShell";
import { FileUploadField } from "@/components/FileUploadField";
import { PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount, requireUser } from "@/lib/auth";
import { startProductInventoryRefreshAction } from "./actions";

export default async function ProductInventoryRefreshPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const params = await searchParams;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Periodic marketplace catalog"
        title="Product Inventory Refresh"
        description="Upload listing and catalog files independently from customer orders and consignments. Existing products and owner-protected values are preserved."
        action={{ href: "/owner/product-inventory", label: "Back to Product Inventory" }}
      />
      {params.error ? <div role="alert" tabIndex={-1} className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{params.error}</div> : null}
      <form action={startProductInventoryRefreshAction} className="max-w-3xl rounded-xl border bg-white p-5 shadow-sm">
        <div className="rounded-md bg-slate-50 p-3 text-sm">
          <p className="font-black">{account.accountDisplayName ?? account.name}</p>
          <p>{account.marketplace} · selected seller account</p>
        </div>
        <div className="mt-4">
          <FileUploadField
            name="files"
            label="Catalog, listings, enrichment files, or ZIP"
            multiple
            required
            accept=".csv,.tsv,.txt,.xlsx,.xlsm,.zip"
            hint="Accepted: CSV, TSV, TXT, XLSX, XLSM, or ZIP. Files are stored privately, classified by headers, and processed in a recoverable job. Workbook macros and formulas are never executed."
          />
        </div>
        <label className="mt-4 block text-sm font-bold">Optional notes<textarea name="notes" maxLength={500} className="mt-2 min-h-24 w-full rounded-md border p-2"/></label>
        <div className="mt-4"><SubmitButton pendingText="Saving files...">Upload and start refresh</SubmitButton></div>
      </form>
    </AppShell>
  );
}
