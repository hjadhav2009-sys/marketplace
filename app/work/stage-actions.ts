"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { WorkStage } from "@prisma/client";
import { requireAccount,requireUser } from "@/lib/auth";
import { completeGroupedStage } from "@/src/lib/workflow/grouped-transition";

const value=(form:FormData,name:string,max=200)=>String(form.get(name)??"").normalize("NFKC").trim().slice(0,max);
export async function completeGroupedStageAction(form:FormData){const user=await requireUser();const account=await requireAccount(user);const stage=value(form,"stage",20) as WorkStage,sourceType=value(form,"sourceType",20) as "ORDER"|"CONSIGNMENT",next=value(form,"nextStage",20) as WorkStage;const path=`/work/${stage.toLowerCase()}?source=${sourceType}`;let error="";try{await completeGroupedStage({actorUserId:user.id,selectedAccountId:account.id,sourceType,stage,groupKey:value(form,"groupKey",80),expectedGroupVersion:value(form,"groupVersion",80),nextStage:next||undefined,useRecommendedNextStage:value(form,"useRecommended",5)==="1",clientRequestId:value(form,"clientRequestId",160)});}catch(cause){error=cause instanceof Error?cause.message:"Could not update work.";}for(const route of ["pick","mark","assemble","pack"])revalidatePath(`/work/${route}`);revalidatePath("/work");redirect(`${path}&${error?`error=${encodeURIComponent(error)}`:`success=${encodeURIComponent("Work routed successfully.")}`}`);}
