import type { PrismaClient, WorkSourceType, WorkStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertWorkerAccountAccess } from "./worker-access";

export async function recordRouteDecisionRejection(input:{accountId:string;actorUserId:string;sourceType:WorkSourceType;stage:WorkStage;requestFingerprint?:string;taskId?:string;sourceId?:string;error:unknown},client:PrismaClient=prisma){
  const safeMessage=(input.error instanceof Error?input.error.message:String(input.error)).replace(/Prisma|P\d{4}|database is locked/gi,"workflow storage").slice(0,500);
  if(!/route|stage|work changed|instruction|request id|transition|packing/i.test(safeMessage))return;
  try{await assertWorkerAccountAccess(input.actorUserId,input.accountId,client);await client.workRouteDecisionRejection.create({data:{accountId:input.accountId,actorUserId:input.actorUserId,taskId:input.taskId??null,sourceType:input.sourceType,sourceId:input.sourceId??null,stage:input.stage,requestFingerprint:input.requestFingerprint??null,rejectionType:/changed|stale|request id/i.test(safeMessage)?"STALE_OR_COLLISION":"ROUTE_REJECTED",safeMessage}});}catch{}
}
