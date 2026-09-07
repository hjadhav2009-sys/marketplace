import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { createProductInventoryImportJob, processProductInventoryJob } from "../src/lib/product-inventory/jobs";
import { sourceColumnsFromHeaders, sourceColumnFingerprint } from "../src/lib/imports/source-column-mapping";
if(process.env.STAGE3_SYNTHETIC_STAGING!=="true"||!process.env.DATABASE_URL?.includes("stage3-sanitized-staging"))throw new Error("Synthetic staging only.");
const [command,accountId]=process.argv.slice(2);
try {
 const account=await prisma.account.findUniqueOrThrow({where:{id:accountId}}),user=await prisma.user.findUniqueOrThrow({where:{id:"stage3-owner"}});
 const sku=`D3A1-${randomUUID()}`,asin=`B0${randomUUID().replaceAll("-","").slice(0,8).toUpperCase()}`;
 // Existing D2A.1 Amazon PRODUCT_CATALOG rows enrich established listings only.
 await prisma.marketplaceListing.create({data:{accountId:account.id,marketplace:"AMAZON",sellerSkuId:sku,sku}});
 const job=await createProductInventoryImportJob({account,user,files:[new File([`Owner Code,Owner Title,Owner ASIN\n${sku},Synthetic mapping product,${asin}\n`],"synthetic-mapping.csv",{type:"text/csv"})]});
 await processProductInventoryJob(job.id);
 const result=await prisma.importJob.findUniqueOrThrow({where:{id:job.id}});
 if(command==="reuse")assert.match(result.status,/^COMPLETED/);
 else assert.equal(result.status,"NEEDS_MAPPING");
 if(command==="prepare"){
  const columns=sourceColumnsFromHeaders({sheetId:"Template",humanHeaders:Array.from({length:900},(_,index)=>index===899?"Owner Code":index>=7&&index<=14?"Other Image URL":`Unused ${index}`)});
  const wide=await prisma.importJob.create({data:{accountId,createdByUserId:user.id,marketplace:"AMAZON",importType:"AMAZON_PRODUCT_INVENTORY",fileName:"synthetic-wide-mapping.xlsx",status:"NEEDS_MAPPING",stage:"NEEDS_MAPPING",progressJson:JSON.stringify({headers:columns.map(c=>c.rawHumanHeader),sourceColumns:columns,fingerprint:sourceColumnFingerprint(columns),requiredFields:["sellerSku"],optionalFields:[]})}});
  console.log(JSON.stringify({jobId:job.id,wideJobId:wide.id,filePath:job.filePath,sku}));
 } else console.log(JSON.stringify({jobId:job.id,status:result.status,sku}));
} finally {await prisma.$disconnect();}
