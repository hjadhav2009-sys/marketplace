import { createHash } from "node:crypto";
import type { Marketplace, MarketplaceFileProfile, MarketplaceImportPurpose, Prisma, PrismaClient, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { DynamicListingFormSchema } from "@/src/lib/catalog/dynamic-form-profiles";
import { assertWorkerAccountAccess } from "@/src/lib/workflow/worker-access";

type Client = PrismaClient | Prisma.TransactionClient;
export type CanonicalFieldMapping = Record<string, string>;

export function normalizeMarketplaceHeader(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase().replace(/[\s_.\-/\\]+/g, " ").replace(/[^\p{L}\p{N}#\[\] ]/gu, "").replace(/\s+/g, " ");
}

export function headerFingerprint(headers: unknown[]) {
  const normalized = headers.map(normalizeMarketplaceHeader).filter(Boolean);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function detectHeaderBand(rows: unknown[][], requiredSignatures: Array<string | RegExp>, limit = 80) {
  for (let index = 0; index < Math.min(rows.length, limit); index += 1) {
    const normalized = rows[index].map(normalizeMarketplaceHeader);
    const matches = requiredSignatures.every((signature) => normalized.some((header) => typeof signature === "string" ? header === normalizeMarketplaceHeader(signature) : signature.test(header)));
    if (matches) return { rowIndex: index, originalHeaders: rows[index].map((value) => String(value ?? "")), normalizedHeaders: normalized, fingerprint: headerFingerprint(rows[index]) };
  }
  return null;
}

export const AMAZON_TECHNICAL_SIGNATURES = [/^contribution sku#1 value$/, /^product type#1 value$/, /^item name\[.*\]#1 value$/, /^main product image locator\[.*\]#1 media location$/];
export const AMAZON_CONSIGNMENT_SIGNATURES = ["Merchant SKU", "ASIN", "FNSKU", "Shipped"];
export const FLIPKART_CONSIGNMENT_SIGNATURES = ["Product Name", "FSN", "SKU Id", "Quantity Sent"];
export const FLIPKART_ORDER_SIGNATURES = ["ORDER ITEM ID", "Order Id", "SKU", "Quantity", "Tracking ID"];

export function profileMapping(profile: Pick<MarketplaceFileProfile, "fieldMappingJson">): CanonicalFieldMapping {
  const parsed = JSON.parse(profile.fieldMappingJson) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Saved field mapping is invalid.");
  return parsed as CanonicalFieldMapping;
}

export async function findHeaderProfile(input: { accountId?: string; marketplace: Marketplace; importPurpose: MarketplaceImportPurpose; headers: unknown[] }, client: Client = prisma) {
  const fingerprint = headerFingerprint(input.headers);
  const profile = await client.marketplaceFileProfile.findFirst({ where: { marketplace: input.marketplace, importPurpose: input.importPurpose, headerFingerprint: fingerprint, active: true, OR: [{ accountId: input.accountId ?? null }, { accountId: null }] }, orderBy: [{ accountId: "desc" }, { version: "desc" }] });
  return profile ? { state: "MATCHED" as const, profile, mapping: profileMapping(profile), fingerprint } : { state: "NEEDS_MAPPING" as const, profile: null, mapping: null, fingerprint };
}

function canManageProfiles(user: Pick<User, "role" | "canImportConsignments">) { return user.role === "OWNER" || user.canImportConsignments; }

export async function saveHeaderProfile(input: { actorUserId: string; accountId: string; marketplace: Marketplace; importPurpose: MarketplaceImportPurpose; profileName: string; headers: string[]; mapping: CanonicalFieldMapping; requiredFields: string[]; optionalFields?: string[]; dataSheetRule?: Record<string, unknown>; dataStartRule?: Record<string, unknown>; formSchema?: Record<string, unknown>; technicalHeaderFingerprint?: string; humanHeaderFingerprint?: string; templateKind?: string; productTypes?: string[]; fieldGroups?: string[] }, client: PrismaClient = prisma) {
  return client.$transaction(async (tx) => {
    const { user } = await assertWorkerAccountAccess(input.actorUserId, input.accountId, tx);
    if (!canManageProfiles(user)) throw new Error("Import profile management permission is required.");
    const fingerprint = headerFingerprint(input.headers); const mapped = new Set(Object.keys(input.mapping));
    if (!input.profileName.trim() || !input.requiredFields.every((field) => mapped.has(field))) throw new Error("Map every required canonical field before saving.");
    const latest = await tx.marketplaceFileProfile.findFirst({ where: { marketplace: input.marketplace, importPurpose: input.importPurpose, headerFingerprint: fingerprint }, orderBy: { version: "desc" } });
    const profile = await tx.marketplaceFileProfile.create({ data: { accountId: input.accountId, marketplace: input.marketplace, importPurpose: input.importPurpose, profileName: input.profileName.normalize("NFKC").trim().slice(0, 160), headerFingerprint: fingerprint, fieldMappingJson: JSON.stringify(input.mapping), requiredFieldsJson: JSON.stringify(input.requiredFields), optionalFieldsJson: JSON.stringify(input.optionalFields ?? []), dataSheetRuleJson: input.dataSheetRule ? JSON.stringify(input.dataSheetRule) : null, dataStartRuleJson: input.dataStartRule ? JSON.stringify(input.dataStartRule) : null, formSchemaJson:input.formSchema?JSON.stringify(input.formSchema):null,technicalHeaderFingerprint:input.technicalHeaderFingerprint??null,humanHeaderFingerprint:input.humanHeaderFingerprint??null,templateKind:input.templateKind?.slice(0,120)??null,productTypesJson:input.productTypes?JSON.stringify(input.productTypes):null,fieldGroupsJson:input.fieldGroups?JSON.stringify(input.fieldGroups):null, version: (latest?.version ?? 0) + 1, active: true, createdByUserId: user.id } });
    await tx.auditLog.create({ data: { userId: user.id, accountId: input.accountId, action: latest ? "MARKETPLACE_FILE_PROFILE_UPDATED" : "MARKETPLACE_FILE_PROFILE_CREATED", entityType: "MarketplaceFileProfile", entityId: profile.id, metadata: JSON.stringify({ marketplace: input.marketplace, importPurpose: input.importPurpose, fingerprint, version: profile.version }) } });
    return profile;
  });
}

const AMAZON_COMMON_PROFILE_FIELDS:Record<string,string>={sellerSkuId:"sellerSku",productTitle:"productTitle",liveBrand:"brand",mainImageUrl:"mainImageUrl",description:"description"};
const boundedProfileHeaders=(values:string[],max:number)=>values.slice(0,250).map(value=>String(value??"").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max));
const PROFILE_VERSION_TARGET=["marketplace","importPurpose","headerFingerprint","version"];
function isProfileVersionRace(error:unknown){
 if(!(error instanceof Error))return false;
 const candidate=error as{code?:unknown;meta?:{target?:unknown}},code=String(candidate.code??"");
 if(code==="P2034"||/database is locked/i.test(error.message))return true;
 if(code!=="P2002")return false;
 const target=candidate.meta?.target,fields=Array.isArray(target)?target.map(String):typeof target==="string"?[target]:[];
 return PROFILE_VERSION_TARGET.every(field=>fields.some(value=>value===field||value.includes(field)));
}

export async function persistDetectedAmazonTemplateProfile(input:{actorUserId:string;accountId:string;technicalHeaders:string[];humanHeaders:string[];technicalHeaderRow:number;humanHeaderRow?:number;dataRow:number;formSchema:DynamicListingFormSchema},client:PrismaClient=prisma){
  if(input.technicalHeaders.length>250||input.humanHeaders.length>250)throw new Error("Detected Amazon marketplace template has too many headers.");
  const technicalHeaders=boundedProfileHeaders(input.technicalHeaders,1000),humanHeaders=boundedProfileHeaders(input.humanHeaders,500),schema=input.formSchema;
  if(schema.marketplace!=="AMAZON"||!technicalHeaders.length||schema.fields.length>250)throw new Error("Detected Amazon marketplace template is invalid.");
  const detectedTechnicalKeys=technicalHeaders.filter(Boolean),schemaTechnicalKeys=schema.fields.map(field=>String(field.technicalKey??"").normalize("NFKC").trim());
  const detectedTechnicalFingerprint=createHash("sha256").update(JSON.stringify(detectedTechnicalKeys.map(value=>value.toLowerCase()))).digest("hex");
  if(JSON.stringify(schemaTechnicalKeys)!==JSON.stringify(detectedTechnicalKeys)||schema.technicalHeaderFingerprint!==detectedTechnicalFingerprint)throw new Error("Detected Amazon marketplace template technical schema is inconsistent.");
  if(headerFingerprint(humanHeaders)!==schema.humanHeaderFingerprint)throw new Error("Detected Amazon marketplace template labels are inconsistent.");
  if(!Number.isInteger(input.technicalHeaderRow)||input.technicalHeaderRow<1||!Number.isInteger(input.dataRow)||input.dataRow<=input.technicalHeaderRow)throw new Error("Detected Amazon marketplace template row positions are invalid.");
  const mapping=Object.fromEntries(schema.fields.flatMap(field=>field.commonFieldTarget&&AMAZON_COMMON_PROFILE_FIELDS[field.commonFieldTarget]?[[AMAZON_COMMON_PROFILE_FIELDS[field.commonFieldTarget],field.technicalKey]]:[]));
  if(!mapping.sellerSku)throw new Error("Detected Amazon marketplace template has no Seller SKU field.");
  const fingerprint=headerFingerprint(technicalHeaders),formSchemaJson=JSON.stringify(schema);if(Buffer.byteLength(formSchemaJson,"utf8")>1_000_000)throw new Error("Detected Amazon marketplace template schema is too large.");
  const persistOnce=()=>client.$transaction(async tx=>{
   const{user}=await assertWorkerAccountAccess(input.actorUserId,input.accountId,tx);if(!canManageProfiles(user))throw new Error("Import profile management permission is required.");
   const account=await tx.account.findFirst({where:{id:input.accountId,active:true},select:{marketplace:true}});if(account?.marketplace!=="AMAZON")throw new Error("Detected Amazon marketplace template does not match the selected account.");
   const current=await tx.marketplaceFileProfile.findFirst({where:{accountId:input.accountId,marketplace:"AMAZON",importPurpose:"PRODUCT_CATALOG",headerFingerprint:fingerprint,active:true},orderBy:{version:"desc"}});
   if(current?.formSchemaJson&&current.technicalHeaderFingerprint===schema.technicalHeaderFingerprint&&current.humanHeaderFingerprint===schema.humanHeaderFingerprint)return current;
   const latest=await tx.marketplaceFileProfile.findFirst({where:{accountId:input.accountId,marketplace:"AMAZON",importPurpose:"PRODUCT_CATALOG",headerFingerprint:fingerprint},orderBy:{version:"desc"},select:{version:true}});
   const occupied=await tx.marketplaceFileProfile.findMany({where:{marketplace:"AMAZON",importPurpose:"PRODUCT_CATALOG",headerFingerprint:fingerprint},select:{version:true},orderBy:{version:"asc"},take:1000}),occupiedVersions=new Set(occupied.map(profile=>profile.version));let version=(latest?.version??0)+1;while(occupiedVersions.has(version)&&version<=1000)version+=1;if(version>1000)throw new Error("Detected Amazon marketplace template has too many saved versions.");
   await tx.marketplaceFileProfile.updateMany({where:{accountId:input.accountId,marketplace:"AMAZON",importPurpose:"PRODUCT_CATALOG",headerFingerprint:fingerprint,active:true},data:{active:false}});
   const profile=await tx.marketplaceFileProfile.create({data:{accountId:input.accountId,marketplace:"AMAZON",importPurpose:"PRODUCT_CATALOG",profileName:`Amazon ${schema.templateKind.replace(/[^a-zA-Z0-9 _-]+/g," ").replace(/\s+/g," ").trim()||"category template"}`.slice(0,160),headerFingerprint:fingerprint,workbookSignatureJson:JSON.stringify({version:1,contentDetected:true,technicalHeaderRow:input.technicalHeaderRow,humanHeaderRow:input.humanHeaderRow??null,dataRow:input.dataRow}),fieldMappingJson:JSON.stringify(mapping),requiredFieldsJson:JSON.stringify(["sellerSku"]),optionalFieldsJson:JSON.stringify(Object.keys(mapping).filter(key=>key!=="sellerSku")),formSchemaJson,technicalHeaderFingerprint:schema.technicalHeaderFingerprint,humanHeaderFingerprint:schema.humanHeaderFingerprint,templateKind:schema.templateKind.slice(0,120),fieldGroupsJson:JSON.stringify(schema.groups),dataSheetRuleJson:JSON.stringify({sheetUsage:"NON_REFERENCE"}),dataStartRuleJson:JSON.stringify({technicalHeaderRow:input.technicalHeaderRow,humanHeaderRow:input.humanHeaderRow??null,dataRow:input.dataRow}),version,active:true,createdByUserId:user.id}});
   await tx.auditLog.create({data:{userId:user.id,accountId:input.accountId,action:current?"MARKETPLACE_FILE_PROFILE_UPDATED":"MARKETPLACE_FILE_PROFILE_CREATED",entityType:"MarketplaceFileProfile",entityId:profile.id,metadata:JSON.stringify({marketplace:"AMAZON",importPurpose:"PRODUCT_CATALOG",fingerprint,technicalHeaderFingerprint:schema.technicalHeaderFingerprint,humanHeaderFingerprint:schema.humanHeaderFingerprint,version:profile.version,contentDetected:true})}});
   return profile;
  });
  let lastError:unknown;for(let attempt=0;attempt<5;attempt+=1){try{return await persistOnce();}catch(error){lastError=error;if(!isProfileVersionRace(error))throw error;if(attempt===4)throw new Error("Detected Amazon template profile changed concurrently; retry the import.");await new Promise(resolve=>setTimeout(resolve,20*(attempt+1)));}}
  throw lastError;
}
