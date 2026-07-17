import type { WorkStage } from "@prisma/client";
import { getCurrentUser,getSelectedAccount } from "@/lib/auth";
import { hasWorkPermission } from "@/lib/work-permissions";
import { getSmartStageSummary } from "@/src/lib/workflow/grouped-work";
export const dynamic="force-dynamic";
export async function GET(){const user=await getCurrentUser();if(!user)return Response.json({error:"Authentication required."},{status:401});const account=await getSelectedAccount(user);if(!account)return Response.json({error:"Select an active seller account."},{status:409});const stages=(["PICK","MARK","ASSEMBLE","PACK"] as WorkStage[]).filter(stage=>hasWorkPermission(user,stage==="PICK"?"canPick":stage==="MARK"?"canMark":stage==="ASSEMBLE"?"canAssemble":"canPack")||user.canViewAllWork),values=await Promise.all(stages.map(stage=>getSmartStageSummary({actorUserId:user.id,accountId:account.id,stage})));return Response.json({summaries:Object.fromEntries(stages.map((stage,index)=>[stage,values[index]]))});}
