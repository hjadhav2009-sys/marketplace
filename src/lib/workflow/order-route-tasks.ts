import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasWorkPermission } from "@/lib/work-permissions";
import { assertWorkerAccountAccess } from "./worker-access";

type Client = PrismaClient;

export async function getOrderMarkingQueue(input:{accountId:string;actorUserId:string;search?:string},client:Client=prisma){
  const {user}=await assertWorkerAccountAccess(input.actorUserId,input.accountId,client);if(!hasWorkPermission(user,"canMark")&&!user.canViewAllWork)throw new Error("Marking permission is required.");
  const search=input.search?.normalize("NFKC").trim().slice(0,160);
  return client.workTask.findMany({where:{accountId:input.accountId,sourceType:"ORDER",stage:"MARK",status:{in:["READY","IN_PROGRESS","PROBLEM"]},AND:[...(search?[{OR:[{order:{awb:search}},{order:{trackingId:search}},{order:{orderNo:search}},{order:{sku:search}}]}]:[]),...(user.role==="OWNER"||user.canViewAllWork?[]:[{OR:[{assignedUserId:null},{assignedUserId:user.id}]}])]},include:{order:true,assignedUser:{select:{name:true}}},orderBy:[{status:"asc"},{updatedAt:"asc"}],take:50});
}

export async function completeOrderMarkingTask(input:{taskId:string;accountId:string;actorUserId:string;expectedStatus:string;clientRequestId?:string},client:Client=prisma){
  return client.$transaction(async(tx)=>{const{user}=await assertWorkerAccountAccess(input.actorUserId,input.accountId,tx);if(!hasWorkPermission(user,"canMark"))throw new Error("Marking permission is required.");const task=await tx.workTask.findFirst({where:{id:input.taskId,accountId:input.accountId,sourceType:"ORDER",stage:"MARK"}});if(!task)throw new Error("Marking task is unavailable.");
    if(task.status==="COMPLETED")return{taskId:task.id,idempotent:true};if(task.status!==input.expectedStatus||!["READY","IN_PROGRESS"].includes(task.status))throw new Error("Marking changed; refresh before completing.");if(task.assignedUserId&&task.assignedUserId!==user.id&&user.role!=="OWNER")throw new Error("This marking task was taken by another worker.");
    if(input.clientRequestId){const prior=await tx.workActionLog.findFirst({where:{taskId:task.id,clientRequestId:input.clientRequestId}});if(prior)return{taskId:task.id,idempotent:true};}
    const changed=await tx.workTask.updateMany({where:{id:task.id,status:task.status,assignedUserId:task.assignedUserId},data:{status:"COMPLETED",completedQuantity:task.requiredQuantity,assignedUserId:task.assignedUserId??user.id,startedAt:task.startedAt??new Date(),startedByUserId:task.startedByUserId??user.id,completedAt:new Date(),completedByUserId:user.id}});if(changed.count!==1)throw new Error("Marking changed; refresh before completing.");
    await tx.workActionLog.create({data:{accountId:input.accountId,taskId:task.id,actorUserId:user.id,action:"TASK_COMPLETED",requestKind:input.clientRequestId?"COMPLETE":null,clientRequestId:input.clientRequestId||null,quantityBefore:task.completedQuantity,quantityAfter:task.requiredQuantity,metadataJson:JSON.stringify({source:"ORDER_ROUTE"})}});
    await tx.workTask.updateMany({where:{orderId:task.orderId,sequenceNumber:task.sequenceNumber+1,status:"LOCKED"},data:{status:"READY"}});return{taskId:task.id,idempotent:false};});
}
