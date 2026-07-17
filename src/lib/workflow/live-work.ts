import type { PrismaClient,WorkStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { GroupedWorkSource } from "./grouped-work";

type Client=PrismaClient;
export type LiveWorkFilter={accountId:string;stage?:WorkStage;sourceType?:GroupedWorkSource};
function where(input:LiveWorkFilter,afterId=0){return{accountId:input.accountId,id:{gt:Math.max(0,afterId)},...(input.stage?{OR:[{stage:input.stage},{stage:null}]}:{}),...(input.sourceType?{sourceType:input.sourceType}:{})};}
export async function getLiveWorkEvents(input:LiveWorkFilter&{afterId?:number;limit?:number},client:Client=prisma){return client.workChangeEvent.findMany({where:where(input,input.afterId),select:{id:true,eventType:true,sourceType:true,stage:true,groupKey:true,entityId:true,createdAt:true},orderBy:{id:"asc"},take:Math.min(Math.max(input.limit??100,1),100)});}
export async function getLiveWorkVersion(input:LiveWorkFilter,client:Client=prisma){const result=await client.workChangeEvent.aggregate({where:where(input),_max:{id:true}});return result._max.id??0;}
export async function pruneLiveWorkEvents(input:{accountId:string;retentionHours?:number;maxEvents?:number},client:Client=prisma){const cutoff=new Date(Date.now()-Math.min(Math.max(input.retentionHours??24,1),168)*60*60*1000),maxEvents=Math.min(Math.max(input.maxEvents??10000,1000),50000),boundary=await client.workChangeEvent.findMany({where:{accountId:input.accountId},select:{id:true},orderBy:{id:"desc"},skip:maxEvents-1,take:1}),maxBoundary=boundary[0]?.id;const deleted=await client.workChangeEvent.deleteMany({where:{accountId:input.accountId,OR:[{createdAt:{lt:cutoff}},...(maxBoundary?[{id:{lt:maxBoundary}}]:[])]}});return deleted.count;}
