import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasWorkPermission } from "@/lib/work-permissions";
import { openMarkingAssetReadStream } from "@/src/lib/marking/storage";
import { assertWorkerAccountAccess } from "@/src/lib/workflow/worker-access";
import { privateStreamResponse } from "@/src/lib/files/private-stream-response";
import { parseOrderMarkingMetadata } from "@/src/lib/workflow/route-task-metadata";

export async function GET(request:Request,{params}:{params:Promise<{taskId:string}>}){
 const user=await getCurrentUser();if(!user)return Response.json({error:"Authentication required."},{status:401});
 try{if(!hasWorkPermission(user,"canMark"))return Response.json({error:"Marking permission required."},{status:403});
 const {taskId}=await params;const preview=new URL(request.url).searchParams.get("type")==="preview";const attachmentType=preview?"MARKING_PREVIEW":"MARKING_FILE";
 const taskAccount=await prisma.workTask.findFirst({where:{id:taskId,stage:"MARK"},select:{accountId:true}});if(!taskAccount)return Response.json({error:"Marking asset unavailable."},{status:404});await assertWorkerAccountAccess(user.id,taskAccount.accountId);
 const task=await prisma.workTask.findFirst({where:{id:taskId,accountId:taskAccount.accountId,stage:"MARK",status:{in:["READY","IN_PROGRESS","PROBLEM"]}},include:{consignmentLine:{include:{markingAsset:true}}}});if(!task)return Response.json({error:"Marking asset unavailable."},{status:404});
 if(task.assignedUserId&&task.assignedUserId!==user.id&&user.role!=="OWNER"&&!user.canViewAllWork)return Response.json({error:"Task is assigned to another worker."},{status:403});const metadata=parseOrderMarkingMetadata(task.metadataJson);const markingAssetId=metadata?.markingAssetId??(task.consignmentLine?.markingAsset?.active?task.consignmentLine.markingAsset.id:null);if(!markingAssetId)return Response.json({error:"Marking asset unavailable."},{status:404});
 const file=await prisma.markingAssetFile.findFirst({where:{markingAssetId,activeVersion:true,attachmentType},orderBy:{versionNumber:"desc"}});if(!file)return Response.json({error:preview?"Preview unavailable.":"Active marking file unavailable."},{status:404});
 const stream=await openMarkingAssetReadStream(file.managedRelativePath);await prisma.workActionLog.create({data:{accountId:task.accountId,taskId:task.id,actorUserId:user.id,action:preview?"MARKING_PREVIEW_OPENED":"MARKING_FILE_DOWNLOADED",metadataJson:JSON.stringify({attachmentType})}});
 return privateStreamResponse(stream,{fileName:file.originalFileName,contentType:file.contentType,disposition:preview?"inline":"attachment"});
 }catch{return Response.json({error:"Marking file unavailable."},{status:404});}
}
