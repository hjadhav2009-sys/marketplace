"use server";
import { redirect } from "next/navigation";
import { requireAccount,requireUser } from "@/lib/auth";
import { findImportJobById,resumeMappedImportJob } from "@/src/lib/import-jobs/store";
import { startImportJob } from "@/src/lib/import-jobs/runner";
import { resumeMappedConsignmentImport } from "@/src/lib/consignments/resume-mapped-import";
import { definitionForImportJob } from "@/src/lib/imports/import-purpose-definitions";
import { saveHeaderProfile } from "@/src/lib/imports/header-profiles";
import { parseHeaderMappingProgress } from "@/src/lib/imports/mapping-request";
import { decodeSourceColumnRef,sameSourceColumn,type CanonicalFieldMappingV2 } from "@/src/lib/imports/source-column-mapping";
import { startProductInventoryJob } from "@/src/lib/product-inventory/jobs";

export async function saveImportHeaderMappingAction(form:FormData){
 const user=await requireUser(["OWNER"]),account=await requireAccount(user),jobId=String(form.get("jobId")??""),job=await findImportJobById(jobId);if(!job||job.accountId!==account.id||job.marketplace!==account.marketplace||job.status!=="NEEDS_MAPPING")redirect(`/owner/imports/${jobId}?mapping=invalid`);const definition=definitionForImportJob(job);if(!definition)redirect(`/owner/imports/${jobId}?mapping=unsupported`);const request=parseHeaderMappingProgress(job.progressJson);if(!request)redirect(`/owner/imports/${jobId}/mapping?error=request`);
 const fields:CanonicalFieldMappingV2["fields"]={};for(const field of definition.fields){const encoded=String(form.get(`map_${field.key}`)??"").trim();if(!encoded)continue;const source=decodeSourceColumnRef(encoded);if(!source||!request.sourceColumns.some(candidate=>sameSourceColumn(candidate,source)))redirect(`/owner/imports/${jobId}/mapping?error=column`);fields[field.key]=source;}
 const required=definition.fields.filter(field=>field.required).map(field=>field.key),optional=definition.fields.filter(field=>!field.required).map(field=>field.key);if(!required.every(field=>fields[field]))redirect(`/owner/imports/${jobId}/mapping?error=required`);
 await saveHeaderProfile({actorUserId:user.id,accountId:account.id,marketplace:definition.marketplace,importPurpose:definition.purpose,profileName:String(form.get("profileName")??definition.label).slice(0,160),headers:request.headers,sourceColumns:request.sourceColumns,mapping:{version:2,fields},requiredFields:required,optionalFields:optional});await resumeMappedImportJob(job.id);
 if(job.importType.includes("CONSIGNMENT")){const result=await resumeMappedConsignmentImport({jobId:job.id,accountId:account.id,user});redirect(`/owner/consignments/${result.batchId}/review?mapping=saved`);}if(job.importType.endsWith("PRODUCT_INVENTORY"))startProductInventoryJob(job.id);else startImportJob(job.id);redirect(`/owner/imports/${job.id}?mapping=saved`);
}
