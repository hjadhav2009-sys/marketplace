import type { Prisma, PrismaClient, User, WorkStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeListingIdentifier } from "@/src/lib/marking/identifiers";
import { assertWorkerAccountAccess, userCanMutateStage } from "./worker-access";

export const WORK_QUEUE_PAGE_SIZE = 50;
type Client = PrismaClient | Prisma.TransactionClient;

export const WORK_TASK_INCLUDE = {
  assignedUser: { select: { id: true, name: true } },
  consignmentLine: { include: {
    consignmentBatch: { select: { id: true, displayName: true, externalConsignmentNumber: true, status: true } },
    markingAsset: { include: { files: { where: { activeVersion: true }, select: { id: true, attachmentType: true, originalFileName: true } } } },
    workTasks: { select: { id: true, stage: true, status: true, sequenceNumber: true }, orderBy: { sequenceNumber: "asc" as const } }
  } }
} satisfies Prisma.WorkTaskInclude;

export async function getWorkerTaskQueue(input: { actorUserId: string; accountId: string; stage: WorkStage; page?: number; search?: string; status?: "active" | "problem" | "completed" }, client: Client = prisma) {
  const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, client);
  if (!userCanMutateStage(user, input.stage)) throw new Error("Worker lacks permission for this stage.");
  const page=Math.max(1,input.page??1); const status=input.status??"active";
  const statuses=status==="problem"?["PROBLEM" as const]:status==="completed"?["COMPLETED" as const]:["READY" as const,"IN_PROGRESS" as const];
  const assignment: Prisma.WorkTaskWhereInput = user.role==="OWNER"||user.canViewAllWork ? {} : { OR:[{assignedUserId:null},{assignedUserId:user.id}] };
  const base: Prisma.WorkTaskWhereInput={accountId:input.accountId,sourceType:"CONSIGNMENT",stage:input.stage,status:{in:statuses},consignmentLine:{completedAt:status==="completed"?undefined:null,consignmentBatch:{status:status==="completed"?{in:["ACTIVE","COMPLETED","PROBLEM"]}:{in:["ACTIVE","PROBLEM"]}}},...assignment};
  const exactIds=await exactListingIds(input.accountId,input.search,client);
  const search=input.search?.normalize("NFKC").trim();
  const where:Prisma.WorkTaskWhereInput={...base,AND:search?[{OR:[
    ...(exactIds.length?[{consignmentLine:{marketplaceListingId:{in:exactIds}}}]:[]),
    {consignmentLine:{consignmentBatch:{externalConsignmentNumber:{equals:search}}}},
    ...(!exactIds.length?[{consignmentLine:{OR:[{sellerSkuSnapshot:{contains:search}},{fsnSnapshot:{contains:search}},{listingIdSnapshot:{contains:search}},{productTitleSnapshot:{contains:search}}]}}]:[])
  ]}]:undefined};
  const [tasks,total]=await Promise.all([client.workTask.findMany({where,include:WORK_TASK_INCLUDE,orderBy:[{status:"asc"},{updatedAt:"asc"},{id:"asc"}],skip:(page-1)*WORK_QUEUE_PAGE_SIZE,take:WORK_QUEUE_PAGE_SIZE}),client.workTask.count({where})]);
  return {tasks,total,page,pageSize:WORK_QUEUE_PAGE_SIZE,user};
}

export type WorkerQueueTask = Awaited<ReturnType<typeof getWorkerTaskQueue>>["tasks"][number];

async function exactListingIds(accountId:string, code:string|undefined, client:Client) {
  if(!code?.trim()) return [];
  const types=["SELLER_SKU","INTERNAL_SKU","FSN","LISTING_ID","LID","EAN","UPC","GTIN","BARCODE"] as const;
  const ors=types.flatMap((type)=>{const normalized=normalizeListingIdentifier(type,code);return normalized?[{identifierType:type,normalizedValue:normalized}]:[];});
  if(!ors.length)return [];
  const rows=await client.marketplaceListingIdentifier.findMany({where:{accountId,active:true,OR:ors},select:{marketplaceListingId:true},take:200});
  return [...new Set(rows.map((row)=>row.marketplaceListingId))];
}

export async function getWorkHubCounts(user: User, accountId: string, client: Client = prisma) {
  await assertWorkerAccountAccess(user.id,accountId,client);
  const stages=(["PICK","MARK","PACK"] as const).filter((stage)=>userCanMutateStage(user,stage));
  const result:Record<string,{ready:number;inProgress:number;mine:number;problems:number;completedToday:number}>={};
  const today=new Date();today.setHours(0,0,0,0);
  for(const stage of stages){
    const base={accountId,sourceType:"CONSIGNMENT" as const,stage};
    const [ready,inProgress,mine,problems,completedToday]=await Promise.all([
      client.workTask.count({where:{...base,status:"READY"}}),client.workTask.count({where:{...base,status:"IN_PROGRESS"}}),client.workTask.count({where:{...base,assignedUserId:user.id,status:{in:["READY","IN_PROGRESS"]}}}),client.workTask.count({where:{...base,status:"PROBLEM"}}),client.workTask.count({where:{...base,status:"COMPLETED",completedAt:{gte:today}}})
    ]);result[stage]={ready,inProgress,mine,problems,completedToday};
  }return result;
}
