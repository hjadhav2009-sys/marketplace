import type { PrismaClient,WorkStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { GroupedWorkSource } from "./grouped-work";

type Client=PrismaClient;
export type LiveWorkFilter={accountId:string;stage?:WorkStage;sourceType?:GroupedWorkSource};
function where(input:LiveWorkFilter,afterId=0){return{accountId:input.accountId,id:{gt:Math.max(0,afterId)},...(input.stage?{OR:[{stage:input.stage},{stage:null}]}:{}),...(input.sourceType?{sourceType:input.sourceType}:{})};}
export async function getLiveWorkEvents(input:LiveWorkFilter&{afterId?:number;limit?:number},client:Client=prisma){return client.workChangeEvent.findMany({where:where(input,input.afterId),select:{id:true,eventType:true,sourceType:true,stage:true,groupKey:true,entityId:true,createdAt:true},orderBy:{id:"asc"},take:Math.min(Math.max(input.limit??100,1),100)});}
export async function getLiveWorkVersion(input:LiveWorkFilter,client:Client=prisma){const result=await client.workChangeEvent.aggregate({where:where(input),_max:{id:true}});return result._max.id??0;}
