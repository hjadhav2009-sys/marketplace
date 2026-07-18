"use server";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { sanitizePublicActionError } from "@/src/lib/import-jobs/safe-error";
import { createProductInventoryImportJob, startProductInventoryJob } from "@/src/lib/product-inventory/jobs";

export async function startProductInventoryRefreshAction(formData:FormData){const user=await requireUser(["OWNER"]);const account=await requireAccount(user);const files=formData.getAll("files").filter((item):item is File=>item instanceof File&&item.size>0);let jobId:string;try{const job=await createProductInventoryImportJob({files,account,user});jobId=job.id;}catch(error){const message=sanitizePublicActionError(error,"Upload could not be started.")??"Upload could not be started.";redirect(`/owner/product-inventory/refresh?error=${encodeURIComponent(message)}`);}startProductInventoryJob(jobId);redirect(`/owner/imports/${jobId}`);}
