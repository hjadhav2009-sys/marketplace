import { prisma } from "../lib/prisma";

const apply=process.argv.includes("--apply");
const accountId=process.argv.find(value=>value.startsWith("--account="))?.slice(10);
if(!accountId)throw new Error("Pass --account=<account-id>. Dry-run is default; use --apply only on an approved copied database.");
const selectedAccountId=accountId;

async function main(){
 const tasks=await prisma.workTask.findMany({where:{accountId:selectedAccountId,sourceType:"ORDER",stage:"ASSEMBLE",status:{in:["READY","IN_PROGRESS","PROBLEM"]}},include:{order:true},orderBy:{id:"asc"}});
 const report:Array<Record<string,unknown>>=[];
 for(const task of tasks){
  if(!task.orderId||!task.order){report.push({taskId:task.id,outcome:"REVIEW_REQUIRED",reason:"Order source missing"});continue;}
  let metadata:Record<string,unknown>={};try{metadata=JSON.parse(task.metadataJson??"") as Record<string,unknown>;}catch{}
  if(!String(metadata.assemblyInstructions??"").trim()){report.push({taskId:task.id,orderId:task.orderId,outcome:"REVIEW_REQUIRED",reason:"Assembly instructions are missing or ambiguous"});continue;}
  const pack=await prisma.workTask.findUnique({where:{orderId_stage:{orderId:task.orderId,stage:"PACK"}}});
  const workCard=task.workCardSnapshotJson??JSON.stringify({version:2,sellerSku:task.order.sku,productTitle:task.order.productDescription,primaryImage:task.order.imageUrl});
  const route=task.routeSnapshotJson??JSON.stringify({version:2,routeVersion:1,recommendedStages:["PICK","ASSEMBLE","PACK"],actualStages:["PICK","ASSEMBLE","PACK"],completedStages:["PICK"],currentStage:"ASSEMBLE",selectedNextStage:"ASSEMBLE",routeDecisionType:"LEGACY_REPAIR"});
  report.push({taskId:task.id,orderId:task.orderId,outcome:apply?"REPAIRED":"WOULD_REPAIR",createPack:!pack,attachSnapshots:!task.workCardSnapshotJson||!task.routeSnapshotJson});
  if(!apply)continue;
  await prisma.$transaction(async tx=>{
   await tx.workTask.update({where:{id:task.id},data:{sequenceNumber:2,workCardSnapshotJson:workCard,routeSnapshotJson:route}});
   if(pack)await tx.workTask.update({where:{id:pack.id},data:{sequenceNumber:3,status:pack.status==="READY"?"LOCKED":pack.status,workCardSnapshotJson:workCard,routeSnapshotJson:route}});
   else await tx.workTask.create({data:{accountId:selectedAccountId,sourceType:"ORDER",orderId:task.orderId,stage:"PACK",sequenceNumber:3,requiredQuantity:task.requiredQuantity,status:"LOCKED",workCardSnapshotJson:workCard,routeSnapshotJson:route,metadataJson:JSON.stringify({version:1,source:"LEGACY_REPAIR"})}});
   await tx.auditLog.create({data:{accountId:selectedAccountId,userId:null,action:"LEGACY_ORDER_WORKFLOW_REPAIRED",entityType:"WorkTask",entityId:task.id,metadata:JSON.stringify({dryRun:false,packCreated:!pack})}});
  });
 }
 console.log(JSON.stringify({accountId:selectedAccountId,dryRun:!apply,reviewed:tasks.length,report},null,2));
}
main().finally(()=>prisma.$disconnect());
