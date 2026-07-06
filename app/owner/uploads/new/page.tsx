import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createFlipkartOrderImportAction, createUploadBatchAction } from "../actions";

type UploadPageProps = {
  searchParams?: Promise<{
    error?: string;
    flipkartBatchId?: string;
  }>;
};

export default async function UploadBatchPage({ searchParams }: UploadPageProps) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const params = await searchParams;
  const flipkartBatch = params?.flipkartBatchId
    ? await prisma.uploadBatch.findFirst({
        where: {
          id: params.flipkartBatchId,
          accountId: account.id
        }
      })
    : null;
  const errorMessage =
    params?.error === "missing-file"
      ? "Upload a label PDF, a manifest PDF, or both."
      : params?.error === "missing-flipkart-orders"
        ? "Upload a Flipkart Order Excel or CSV file."
        : params?.error === "invalid-flipkart-orders"
          ? "Choose a valid Flipkart .xlsx or .csv order export."
          : params?.error === "flipkart-order-import-failed"
            ? "The Flipkart order file could not be imported. Check the Excel headers and try again."
      : params?.error === "too-large"
      ? "The PDF upload is larger than 100 MB. Split the marketplace download into smaller files and upload again."
      : params?.error === "parse-failed"
        ? "The PDF could not be parsed. Try a text-based marketplace PDF; scanned image PDFs will need OCR in a later sprint."
        : params?.error
          ? "Choose valid marketplace PDF files."
          : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Upload"
        title="Upload marketplace files"
        description="Upload Flipkart Order Excel/CSV files or use the inherited PDF review pipeline for the existing foundation."
      />

      {flipkartBatch ? (
        <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
          Flipkart order import finished: {flipkartBatch.createdRows} created, {flipkartBatch.updatedRows} updated,{" "}
          {flipkartBatch.duplicateRows} duplicate, {flipkartBatch.missingImageRows} missing image mapping, {flipkartBatch.errorRows} held for review.{" "}
          <a href={`/owner/uploads/${flipkartBatch.id}/review`} className="underline">
            Open review
          </a>
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <form action={createFlipkartOrderImportAction} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3 rounded-md bg-slate-50 px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected account</p>
              <p className="mt-1 font-bold text-slate-950">{account.name}</p>
            </div>
            <a href="/accounts" className="text-sm font-semibold text-berry underline">
              Switch
            </a>
          </div>
          <h2 className="text-lg font-semibold text-slate-950">Flipkart Orders</h2>
          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-700">Flipkart Order Excel or CSV</span>
            <input
              name="flipkartOrderExcel"
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              required
              className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
            />
            <span className="mt-2 block text-sm text-slate-500">Uses Tracking ID for packing scans and ORDER ITEM ID for duplicates.</span>
          </label>
          <div className="mt-4 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            Upload sanitized Flipkart `.xlsx` or `.csv` order exports only. The file is saved first, then processed on the Import Progress page.
          </div>
          <div className="mt-5">
            <SubmitButton pendingText="Creating job...">Import Flipkart orders</SubmitButton>
          </div>
        </form>

        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md bg-slate-50 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected account</p>
            <p className="mt-1 font-bold text-slate-950">{account.name}</p>
          </div>
          <a href="/accounts" className="text-sm font-semibold text-berry underline">
            Switch
          </a>
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <form action={createUploadBatchAction} className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-950">Legacy PDF review</h2>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Sub order labels PDF</span>
            <input
              name="labelPdf"
              type="file"
              accept="application/pdf,.pdf"
              className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
            />
            <span className="mt-2 block text-sm text-slate-500">For now, use sanitized text-based label PDFs only.</span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Supplier manifest or picklist PDF</span>
            <input
              name="manifestPdf"
              type="file"
              accept="application/pdf,.pdf"
              className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
            />
            <span className="mt-2 block text-sm text-slate-500">For now, use sanitized text-based manifest or picklist PDFs only.</span>
          </label>

          <div className="rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            Upload at least one PDF. The app reads text from the file, saves parsed review rows, and does not store the
            original PDF or product image files.
          </div>

          <SubmitButton pendingText="Parsing PDFs...">Parse for review</SubmitButton>
        </form>
        </div>
      </section>
    </AppShell>
  );
}
