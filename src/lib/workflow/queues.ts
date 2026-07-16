import type { Prisma, PrismaClient, User, WorkStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeListingIdentifier } from "@/src/lib/marking/identifiers";
import { startOfApplicationDay } from "./dates";
import { assertWorkerAccountAccess, userCanMutateStage, userCanViewAllConsignmentWork } from "./worker-access";

export const WORK_QUEUE_PAGE_SIZE = 50;
type Client = PrismaClient | Prisma.TransactionClient;

export const WORK_TASK_INCLUDE = {
  account: { select: { name: true, accountDisplayName: true } },
  assignedUser: { select: { id: true, name: true } },
  problemReportedBy: { select: { id: true, name: true } },
  actionLogs: { where: { action: "TASK_PROBLEM_REPORTED" as const }, orderBy: { createdAt: "desc" as const }, take: 1, select: { note: true } },
  consignmentLine: { include: {
    consignmentBatch: { select: { id: true, displayName: true, externalConsignmentNumber: true, marketplace: true, status: true } },
    marketplaceListing: { select: { mainImageUrl: true } },
    markingAsset: true,
    workTasks: { select: { id: true, stage: true, status: true, sequenceNumber: true }, orderBy: { sequenceNumber: "asc" as const } }
  } }
} satisfies Prisma.WorkTaskInclude;

export async function getWorkerTaskQueue(input: { actorUserId: string; accountId: string; stage: WorkStage; page?: number; search?: string; status?: "active" | "problem" | "completed" }, client: Client = prisma) {
  const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, client);
  if (!userCanMutateStage(user, input.stage)) throw new Error("Worker lacks permission for this stage.");
  const page=Math.max(1,input.page??1); const status=input.status??"active";
  const statuses=status==="problem"?["PROBLEM" as const]:status==="completed"?["COMPLETED" as const]:["READY" as const,"IN_PROGRESS" as const];
  const assignment: Prisma.WorkTaskWhereInput = userCanViewAllConsignmentWork(user) ? {} : { OR:[{assignedUserId:null},{assignedUserId:user.id}] };
  const base: Prisma.WorkTaskWhereInput={accountId:input.accountId,sourceType:"CONSIGNMENT",stage:input.stage,status:{in:statuses},completedAt:status==="completed"?{gte:startOfApplicationDay()}:undefined,consignmentLine:{completedAt:status==="completed"?undefined:null,consignmentBatch:{status:status==="completed"?{in:["ACTIVE","COMPLETED","PROBLEM"]}:{in:["ACTIVE","PROBLEM"]}}},...assignment};
  const exactIds=await exactListingIds(input.accountId,input.search,client);
  const search=input.search?.normalize("NFKC").trim();
  const where:Prisma.WorkTaskWhereInput={...base,AND:search?[{OR:[
    ...(exactIds.length?[{consignmentLine:{marketplaceListingId:{in:exactIds}}}]:[]),
    {consignmentLine:{consignmentBatch:{externalConsignmentNumber:{equals:search}}}},
    {consignmentLine:{OR:[{sellerSkuSnapshot:{contains:search}},{fnskuSnapshot:{contains:search}},{asinSnapshot:{contains:search}},{externalIdSnapshot:{contains:search}},{barcodeSnapshot:{contains:search}},{fsnSnapshot:{contains:search}},{listingIdSnapshot:{contains:search}},{productTitleSnapshot:{contains:search}}]}}
  ]}]:undefined};
  const [tasks,total]=await Promise.all([client.workTask.findMany({where,include:WORK_TASK_INCLUDE,orderBy:[{status:"asc"},{updatedAt:"asc"},{id:"asc"}],skip:(page-1)*WORK_QUEUE_PAGE_SIZE,take:WORK_QUEUE_PAGE_SIZE}),client.workTask.count({where})]);
  return {tasks,total,page,pageSize:WORK_QUEUE_PAGE_SIZE,user};
}

export type WorkerQueueTask = Awaited<ReturnType<typeof getWorkerTaskQueue>>["tasks"][number];

async function exactListingIds(accountId:string, code:string|undefined, client:Client) {
  if(!code?.trim()) return [];
  const types=["SELLER_SKU","INTERNAL_SKU","FSN","LISTING_ID","LID","FNSKU","ASIN","EXTERNAL_ID","EAN","UPC","GTIN","MODEL_NUMBER","BARCODE"] as const;
  const ors=types.flatMap((type)=>{const normalized=normalizeListingIdentifier(type,code);return normalized?[{identifierType:type,normalizedValue:normalized}]:[];});
  if(!ors.length)return [];
  const rows=await client.marketplaceListingIdentifier.findMany({where:{accountId,active:true,OR:ors},select:{marketplaceListingId:true},take:200});
  return [...new Set(rows.map((row)=>row.marketplaceListingId))];
}

export async function getWorkHubCounts(user: User, accountId: string, client: Client = prisma) {
  await assertWorkerAccountAccess(user.id,accountId,client);
  const stages=(["PICK","MARK","ASSEMBLE","PACK"] as const).filter((stage)=>userCanMutateStage(user,stage));
  const result:Record<string,{ready:number;inProgress:number;mine:number;problems:number;completedToday:number}>={};
  const today=startOfApplicationDay();const accountWide=userCanViewAllConsignmentWork(user);
  for(const stage of stages){
    const base:Prisma.WorkTaskWhereInput={accountId,sourceType:"CONSIGNMENT",stage,consignmentLine:{completedAt:null,consignmentBatch:{status:{in:["ACTIVE","PROBLEM"]}}}};
    const readyVisibility:Prisma.WorkTaskWhereInput=accountWide?{}:{OR:[{assignedUserId:null},{assignedUserId:user.id}]};
    const inProgressVisibility:Prisma.WorkTaskWhereInput=accountWide?{}:{assignedUserId:user.id};
    const problemVisibility:Prisma.WorkTaskWhereInput=accountWide?{}:{OR:[{assignedUserId:user.id},{problemReportedByUserId:user.id}]};
    const completedVisibility:Prisma.WorkTaskWhereInput=accountWide?{}:{completedByUserId:user.id};
    const [ready,inProgress,mine,problems,completedToday]=await Promise.all([
      client.workTask.count({where:{...base,status:"READY",...readyVisibility}}),client.workTask.count({where:{...base,status:"IN_PROGRESS",...inProgressVisibility}}),client.workTask.count({where:{...base,assignedUserId:user.id,status:{in:["READY","IN_PROGRESS"]}}}),client.workTask.count({where:{...base,status:"PROBLEM",...problemVisibility}}),client.workTask.count({where:{accountId,sourceType:"CONSIGNMENT",stage,status:"COMPLETED",completedAt:{gte:today},...completedVisibility}})
    ]);result[stage]={ready,inProgress,mine,problems,completedToday};
  }return result;
}
