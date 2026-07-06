import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ImportJobProgress } from "@/components/ImportJobProgress";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { requireUser } from "@/lib/auth";
import { findImportJobById } from "@/src/lib/import-jobs/store";
import { startImportJob } from "@/src/lib/import-jobs/runner";

type ImportJobPageProps = {
  params: Promise<{
    jobId: string;
  }>;
};

export default async function ImportJobPage({ params }: ImportJobPageProps) {
  await requireUser(["OWNER"]);
  const { jobId } = await params;
  const job = await findImportJobById(jobId);

  if (!job) {
    notFound();
  }

  if (job.status === "QUEUED" || job.status === "RUNNING") {
    startImportJob(job.id);
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Import Progress"
        title="Flipkart import job"
        description="Keep this owner PC running while the job processes. The page refreshes progress without rendering the whole file."
      >
        <StatusBadge value={job.status} />
      </PageHeader>

      <ImportJobProgress initialJob={job} />
    </AppShell>
  );
}
