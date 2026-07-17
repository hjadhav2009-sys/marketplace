import type { Marketplace, Prisma, PrismaClient } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

export async function assertAccountMarketplaceChangeAllowed(accountId:string,marketplace:Marketplace,client:Client){
 const existing=await client.account.findUnique({where:{id:accountId},select:{marketplace:true,_count:{select:{marketplaceListings:true,orders:true,importJobs:true,consignmentBatches:true,workTasks:true,fileProfiles:true,processRules:true}}}});if(!existing)throw new Error("ACCOUNT_INVALID");if(existing.marketplace!==marketplace&&Object.values(existing._count).some(count=>count>0))throw new Error("ACCOUNT_MARKETPLACE_LOCKED");return existing;
}

export async function setAccountActiveSafely(input:{accountId:string;active:boolean;confirmation?:string},client:PrismaClient){
 return client.$transaction(async tx=>{const current=await tx.account.findUnique({where:{id:input.accountId},select:{id:true,code:true,active:true}});if(!current)throw new Error("ACCOUNT_INVALID");if(!input.active){const [activeWork,runningImports]=await Promise.all([tx.workTask.count({where:{accountId:input.accountId,status:{in:["LOCKED","READY","IN_PROGRESS","PROBLEM"]}}}),tx.importJob.count({where:{accountId:input.accountId,status:{in:["QUEUED","RUNNING","NEEDS_MAPPING"]}}})]);if((activeWork||runningImports)&&input.confirmation!==current.code)throw new Error("ACCOUNT_CONFIRMATION_REQUIRED");await tx.importJob.updateMany({where:{accountId:input.accountId,status:{in:["QUEUED","RUNNING"]}},data:{cancelRequestedAt:new Date(),stage:"ACCOUNT_DEACTIVATED"}});}return tx.account.update({where:{id:input.accountId},data:{active:input.active}});});
}
