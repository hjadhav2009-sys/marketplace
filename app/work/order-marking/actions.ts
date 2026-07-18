"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount,requireUser } from "@/lib/auth";
import { completeOrderMarkingTask,reportOrderMarkingProblem } from "@/src/lib/workflow/order-route-tasks";

function finish(error:string){revalidatePath("/work/order-marking");redirect(`/work/order-marking?${error?`error=${encodeURIComponent(error)}`:"success=1"}`);}
export async function completeOrderMarkingAction(form:FormData){const user=await requireUser();const account=await requireAccount(user);let error="";try{await completeOrderMarkingTask({taskId:String(form.get("taskId")??""),accountId:account.id,actorUserId:user.id,expectedStatus:String(form.get("expectedStatus")??""),clientRequestId:String(form.get("clientRequestId")??"")});}catch(cause){error=cause instanceof Error?cause.message:"Could not complete marking.";}finish(error);}
export async function reportOrderMarkingProblemAction(form:FormData){const user=await requireUser();const account=await requireAccount(user);let error="";try{await reportOrderMarkingProblem({taskId:String(form.get("taskId")??""),accountId:account.id,actorUserId:user.id,expectedStatus:String(form.get("expectedStatus")??""),reason:String(form.get("reason")??"").replaceAll(" ","_"),note:String(form.get("note")??""),clientRequestId:String(form.get("clientRequestId")??"")});}catch(cause){error=cause instanceof Error?cause.message:"Could not report marking problem.";}finish(error);}
