import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { toPublicImportJob } from "@/src/lib/import-jobs/public-job";
import { findImportJobById } from "@/src/lib/import-jobs/store";

type ImportJobStatusRouteProps = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(_request: Request, { params }: ImportJobStatusRouteProps) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { jobId } = await params;
  const job = await findImportJobById(jobId);

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ job: toPublicImportJob(job) });
}
