import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount, requireUser } from "@/lib/auth";
import { createUploadBatchAction } from "../actions";

type UploadPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function UploadBatchPage({ searchParams }: UploadPageProps) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const params = await searchParams;
  const errorMessage =
    params?.error === "missing-file"
      ? "Upload a label PDF, a manifest PDF, or both."
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
        description="Flipkart parser support starts here. The inherited PDF review pipeline stays in place while Flipkart CSV/PDF extraction is built."
      />

      <section className="max-w-2xl rounded-md border border-slate-200 bg-white p-5 shadow-sm">
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
      </section>
    </AppShell>
  );
}
