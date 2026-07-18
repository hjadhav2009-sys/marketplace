import { getMobilePermissionAccountContext, mobileError, mobileJson } from "@/lib/mobile-api";
import { toPublicImportJob } from "@/src/lib/import-jobs/public-job";
import { findImportJobById } from "@/src/lib/import-jobs/store";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = await getMobilePermissionAccountContext(request, "canViewImports");

  if (!auth.ok) {
    return auth.response;
  }

  const { jobId } = await context.params;
  const job = await findImportJobById(jobId);

  if (!job || job.accountId !== auth.account.id) {
    return mobileError("not_found", "Import job was not found.", 404);
  }

  return mobileJson({ ok: true, job: toPublicImportJob(job) });
}
