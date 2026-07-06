"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getRequestMeta } from "@/lib/request-context";
import { createRetryImportJob, retainedImportJobFileExists, startImportJob } from "@/src/lib/import-jobs/runner";
import { findImportJobById } from "@/src/lib/import-jobs/store";

export async function retryImportJobAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const request = await getRequestMeta();
  const jobId = String(formData.get("jobId") ?? "");
  const job = await findImportJobById(jobId);

  if (!job) {
    redirect("/owner/imports?retry=missing");
  }

  if (job.status !== "FAILED" && job.status !== "CANCELLED") {
    redirect(`/owner/imports/${job.id}?retry=not-needed`);
  }

  if (!(await retainedImportJobFileExists(job.filePath))) {
    redirect(`/owner/imports/${job.id}?retry=file-missing`);
  }

  const retryJob = await createRetryImportJob({ sourceJob: job, user });
  startImportJob(retryJob.id, request);
  redirect(`/owner/imports/${retryJob.id}?retry=started`);
}
