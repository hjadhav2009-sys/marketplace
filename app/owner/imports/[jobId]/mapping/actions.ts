"use server";
import { redirect } from "next/navigation";
import { requireAccount,requireUser } from "@/lib/auth";
import { findImportJobById,resumeMappedImportJob } from "@/src/lib/import-jobs/store";
import { saveHeaderProfile } from "@/src/lib/imports/header-profiles";
import { startImportJob } from "@/src/lib/import-jobs/runner";

const REQUIRED=["orderItemId","orderId","sellerSku","quantity","trackingId"],OPTIONAL=["shipmentId","fsn","productTitle","city","state"];
export async function saveImportHeaderMappingAction(form:FormData){const user=await requireUser(["OWNER"]),account=await requireAccount(user),jobId=String(form.get("jobId")??""),job=await findImportJobById(jobId);if(!job||job.accountId!==account.id||job.status!=="NEEDS_MAPPING"||job.importType!=="FLIPKART_ORDER")redirect(`/owner/imports/${jobId}?mapping=invalid`);let progress:{headers?:string[]};try{progress=JSON.parse(job.progressJson??"{}") as{headers?:string[]};}catch{progress={};}const headers=progress.headers??[],mapping:Record<string,string>={};for(const field of [...REQUIRED,...OPTIONAL]){const source=String(form.get(`map_${field}`)??"").normalize("NFKC").trim();if(source){if(!headers.includes(source))redirect(`/owner/imports/${jobId}/mapping?error=header`);mapping[field]=source;}}if(!REQUIRED.every(field=>mapping[field]))redirect(`/owner/imports/${jobId}/mapping?error=required`);await saveHeaderProfile({actorUserId:user.id,accountId:account.id,marketplace:"FLIPKART",importPurpose:"DAILY_ORDER",profileName:String(form.get("profileName")??"Flipkart Daily Orders").slice(0,160),headers,mapping,requiredFields:REQUIRED,optionalFields:OPTIONAL});await resumeMappedImportJob(job.id);startImportJob(job.id);redirect(`/owner/imports/${job.id}?mapping=saved`);}
