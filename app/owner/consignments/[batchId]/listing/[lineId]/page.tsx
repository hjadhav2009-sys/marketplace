import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DynamicMarketplaceListingForm } from "@/components/DynamicMarketplaceListingForm";
import { PageHeader } from "@/components/PageHeader";
import { requireAccount } from "@/lib/auth";
import { requireConsignmentAccess } from "@/lib/consignment-auth";
import { prisma } from "@/lib/prisma";
import type { DynamicListingFormSchema } from "@/src/lib/catalog/dynamic-form-profiles";
import { createConsignmentFullListingAction } from "../../../actions";

export default async function ConsignmentListingPage({params}:{params:Promise<{batchId:string;lineId:string}>}){
  const user=await requireConsignmentAccess("manage"),account=await requireAccount(user),{batchId,lineId}=await params;
  const [line,profiles]=await Promise.all([
    prisma.consignmentLine.findFirst({where:{id:lineId,consignmentBatchId:batchId,accountId:account.id,activated:false,marketplaceListingId:null},include:{consignmentBatch:true}}),
    prisma.marketplaceFileProfile.findMany({where:{OR:[{accountId:account.id},{accountId:null}],marketplace:account.marketplace,importPurpose:"PRODUCT_CATALOG",active:true,formSchemaJson:{not:null}},orderBy:[{accountId:"desc"},{updatedAt:"desc"}],take:12})
  ]);
  if(!line||line.consignmentBatch.marketplace!==account.marketplace)notFound();
  const parsedProfiles=profiles.map(profile=>{let schema:DynamicListingFormSchema|null=null;try{schema=JSON.parse(profile.formSchemaJson??"null")}catch{}return{id:profile.id,name:profile.profileName,schema}});
  const knownIdentifiers=[line.fsnSource?{type:"FSN",value:line.fsnSource}:null,line.asinSource?{type:"ASIN",value:line.asinSource}:null,line.fnskuSource?{type:"FNSKU",value:line.fnskuSource}:null,line.externalIdSource?{type:"EXTERNAL_ID",value:line.externalIdSource}:null].filter((item):item is {type:string;value:string}=>Boolean(item));
  return <AppShell><div className="mx-auto max-w-4xl"><PageHeader eyebrow="Consignment missing listing" title="Create Product Inventory and resolve line" description={`Required work quantity ${line.requiredQuantity} is immutable. Saving resolves the catalog match but does not activate the Consignment.`}/><DynamicMarketplaceListingForm action={createConsignmentFullListingAction} issueId={line.id} issueVersion={0} clientRequestId={randomUUID()} marketplace={account.marketplace} sellerSku={line.sellerSkuSource??""} knownIdentifiers={knownIdentifiers} profiles={parsedProfiles} contextFields={{batchId}}/></div></AppShell>;
}
