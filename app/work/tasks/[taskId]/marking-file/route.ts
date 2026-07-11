import { getCurrentUser, getSelectedAccount } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasWorkPermission } from "@/lib/work-permissions";
import { openMarkingAssetReadStream } from "@/src/lib/marking/storage";
import { assertWorkerAccountAccess } from "@/src/lib/workflow/worker-access";
import { privateStreamResponse } from "@/src/lib/files/private-stream-response";

export async function GET(request:Request,{params}:{params:Promise<{taskId:string}>}){
 const user=await getCurrentUser();if(!user)return Response.json({error:"Authentication required."},{status:401});const account=await getSelectedAccount(user);if(!account)return Response.json({error:"Selected account required."},{status:403});
 try{await assertWorkerAccountAccess(user.id,account.id);if(!hasWorkPermission(user,"canMark"))return Response.json({error:"Marking permission required."},{status:403});
 const {taskId}=await params;const preview=new URL(request.url).searchParams.get("type")==="preview";const attachmentType=preview?"MARKING_PREVIEW":"MARKING_FILE";
 const task=await prisma.workTask.findFirst({where:{id:taskId,accountId:account.id,sourceType:"CONSIGNMENT",stage:"MARK",status:{in:["READY","IN_PROGRESS"]}},include:{consignmentLine:{include:{markingAsset:{include:{files:{where:{activeVersion:true,attachmentType},take:1}}}}}}});
 if(!task?.consignmentLine?.markingAsset?.active)return Response.json({error:"Marking asset unavailable."},{status:404});if(task.assignedUserId&&task.assignedUserId!==user.id&&user.role!=="OWNER"&&!user.canViewAllWork)return Response.json({error:"Task is assigned to another worker."},{status:403});
 const file=task.consignmentLine.markingAsset.files[0];if(!file)return Response.json({error:preview?"Preview unavailable.":"Active marking file unavailable."},{status:404});
 const stream=await openMarkingAssetReadStream(file.managedRelativePath);await prisma.workActionLog.create({data:{accountId:account.id,taskId:task.id,actorUserId:user.id,action:preview?"MARKING_PREVIEW_OPENED":"MARKING_FILE_DOWNLOADED",metadataJson:JSON.stringify({attachmentType})}});
 return privateStreamResponse(stream,{fileName:file.originalFileName,contentType:file.contentType,disposition:preview?"inline":"attachment"});
 }catch{return Response.json({error:"Marking file unavailable."},{status:404});}
}
