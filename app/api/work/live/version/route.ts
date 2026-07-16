import type { WorkStage } from "@prisma/client";
import { getCurrentUser,getSelectedAccount } from "@/lib/auth";
import { getLiveWorkVersion } from "@/src/lib/workflow/live-work";
import type { GroupedWorkSource } from "@/src/lib/workflow/grouped-work";

export const dynamic="force-dynamic";
const stages=new Set(["PICK","MARK","ASSEMBLE","PACK"]),sources=new Set(["ORDER","CONSIGNMENT"]);
export async function GET(request:Request){const user=await getCurrentUser();if(!user)return Response.json({error:"Authentication required."},{status:401});const account=await getSelectedAccount(user);if(!account)return Response.json({error:"Select an active seller account."},{status:409});const url=new URL(request.url),stage=url.searchParams.get("stage"),source=url.searchParams.get("source");if(stage&&!stages.has(stage)||source&&!sources.has(source))return Response.json({error:"Invalid work filter."},{status:400});return Response.json({version:await getLiveWorkVersion({accountId:account.id,stage:stage as WorkStage|undefined,sourceType:source as GroupedWorkSource|undefined})},{headers:{"Cache-Control":"no-store"}});}
