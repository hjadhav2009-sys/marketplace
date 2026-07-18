import type { WorkStage } from "@prisma/client";
import { getCurrentUser,getSelectedAccount } from "@/lib/auth";
import { getSmartStageSummary } from "@/src/lib/workflow/grouped-work";

export const dynamic="force-dynamic";export const runtime="nodejs";
const stages=new Set(["PICK","MARK","ASSEMBLE","PACK"]);
export async function GET(request:Request){const user=await getCurrentUser();if(!user)return Response.json({error:"Authentication required."},{status:401});const account=await getSelectedAccount(user);if(!account)return Response.json({error:"Select an active seller account."},{status:409});const rawStage=new URL(request.url).searchParams.get("stage");if(!rawStage||!stages.has(rawStage))return Response.json({error:"Invalid work stage."},{status:400});try{return Response.json({stage:rawStage,summary:await getSmartStageSummary({actorUserId:user.id,accountId:account.id,stage:rawStage as WorkStage})});}catch(cause){const message=cause instanceof Error?cause.message:"Summary is unavailable.";return Response.json({error:message},{status:/permission|assigned|access/i.test(message)?403:409});}}
