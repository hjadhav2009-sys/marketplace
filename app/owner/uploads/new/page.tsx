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
  await requireAccount(user);
  const params = await searchParams;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Upload"
        title="Upload Meesho label PDF"
        description="Create a batch for parsing and review. Sprint 0 stores batch metadata only; the parser can be added behind this action later."
      />

      <section className="max-w-2xl rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        {params?.error ? (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            Choose a Meesho label PDF file.
          </div>
        ) : null}

        <form action={createUploadBatchAction} className="space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Label PDF</span>
            <input
              name="labelPdf"
              type="file"
              accept="application/pdf,.pdf"
              required
              className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
            />
          </label>

          <div className="rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            Files are not persisted in this foundation. The future PDF parser should stream the file, extract label rows,
            and save only order fields needed for picking and packing.
          </div>

          <SubmitButton pendingText="Creating batch...">Create batch</SubmitButton>
        </form>
      </section>
    </AppShell>
  );
}
