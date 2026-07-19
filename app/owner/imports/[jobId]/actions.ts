"use server";

import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { getRequestMeta } from "@/lib/request-context";
import { createRetryImportJob, retainedImportJobFileExists, startImportJob } from "@/src/lib/import-jobs/runner";
import { sanitizePublicActionError } from "@/src/lib/import-jobs/safe-error";
import { findImportJobById } from "@/src/lib/import-jobs/store";
import { confirmProductInventoryFileRoles, queueProductInventoryJobRetry, requestProductInventoryJobCancel, startProductInventoryJob } from "@/src/lib/product-inventory/jobs";

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

export async function cancelProductInventoryJobAction(formData:FormData){await requireUser(["OWNER"]);const jobId=String(formData.get("jobId")??"");const job=await findImportJobById(jobId);if(!job||!job.importType.endsWith("PRODUCT_INVENTORY"))redirect("/owner/imports");await requestProductInventoryJobCancel(jobId,job.accountId);redirect(`/owner/imports/${jobId}`);}

export async function retryProductInventoryJobAction(formData:FormData){const user=await requireUser(["OWNER"]),account=await requireAccount(user),jobId=String(formData.get("jobId")??"");try{await queueProductInventoryJobRetry({jobId,accountId:account.id,actorUserId:user.id});}catch(error){const message=sanitizePublicActionError(error,"Product Inventory retry failed.")??"Product Inventory retry failed.";redirect(`/owner/imports/${jobId}?retry=${encodeURIComponent(message)}`);}startProductInventoryJob(jobId);redirect(`/owner/imports/${jobId}?retry=started`);}

export async function confirmAmazonFileRolesAction(formData:FormData){
  const user=await requireUser(["OWNER"]),account=await requireAccount(user),jobId=String(formData.get("jobId")??"");
  const roles:Record<string,string>={};
  for(const [key,value] of formData.entries())if(key.startsWith("role_")&&typeof value==="string")roles[key.slice(5)]=value;
  try{await confirmProductInventoryFileRoles({jobId,accountId:account.id,actorUserId:user.id,roles});}
  catch(error){const message=sanitizePublicActionError(error,"Amazon file roles could not be saved.")??"Amazon file roles could not be saved.";redirect(`/owner/imports/${jobId}?rolesError=${encodeURIComponent(message)}`);}
  startProductInventoryJob(jobId);
  redirect(`/owner/imports/${jobId}?roles=saved`);
}
