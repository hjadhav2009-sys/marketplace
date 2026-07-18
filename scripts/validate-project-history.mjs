import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const historyDirectory=resolve(process.cwd(),"docs/history");
const candidates=readdirSync(historyDirectory).filter((name)=>/^PROJECT_HISTORY_PHASE_1_TO_7_2A_\d+_LINES\.txt$/.test(name));
if(candidates.length!==1)throw new Error(`Expected exactly one consolidated history artifact; found ${candidates.length}.`);
const file=resolve(historyDirectory,candidates[0]);
const declaredMatch=file.match(/_(\d+)_LINES\.txt$/), declaredLineCount=declaredMatch?Number(declaredMatch[1]):NaN;
const buffer=readFileSync(file); const roundTrip=Buffer.from(buffer.toString("utf8"),"utf8");
const utf8Valid=buffer.equals(roundTrip); const text=buffer.toString("utf8"); const terminated=/\r?\n$/.test(text);
const lines=(terminated?text.replace(/\r?\n$/,""):text).split(/\r?\n/); const numberingErrors=[]; const payloads=new Set(); const duplicatePayloads=[];
for(let index=0;index<lines.length;index++){const expected=String(index+1).padStart(6,"0");const match=lines[index].match(/^(\d{6}) \| (.+)$/);if(!match||match[1]!==expected)numberingErrors.push(index+1);else if(payloads.has(match[2]))duplicatePayloads.push(index+1);else payloads.add(match[2]);}
const forbidden=[/\blorem ipsum\b/i,/\bmeaningless padding\b/i,/\b(?:filler|dummy padding)\b/i,/\b[A-Z]:\\[A-Za-z0-9]/i,/\/(?:home|Users)\/[^/]+\//,/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/,/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\./,/\b(?:SESSION_SECRET|DATABASE_URL)\s*=/];
const privacyErrors=[];lines.forEach((line,index)=>{if(forbidden.some((pattern)=>pattern.test(line)))privacyErrors.push(index+1);});
const laterBranchErrors=[];lines.forEach((line,index)=>{const implementation=/(bacf4bf|PHASE_7_2B|BULK_PRODUCT_INVENTORY|PRODUCT_INVENTORY_REFRESH|product-inventory\/refresh|product-inventory-import|mergeMarketplaceCatalogRows|20260713000100_product_inventory_import_jobs)/i.test(line);const status=/(Phase 7\.2B|Phase 7\.2C)/i.test(line)&&!/not implemented/i.test(line);if(implementation||status)laterBranchErrors.push(index+1);});
const result={utf8Valid,newlineTerminated:terminated,lineCount:lines.length,requestedTargetLineCount:50000,declaredLineCount,declaredCountMatches:lines.length===declaredLineCount,sequentialNumbering:numberingErrors.length===0,numberingErrors:numberingErrors.slice(0,20),noDuplicatePayloads:duplicatePayloads.length===0,duplicatePayloads:duplicatePayloads.slice(0,20),privacyAndPaddingChecks:privacyErrors.length===0,privacyErrors:privacyErrors.slice(0,20),branchPurityChecks:laterBranchErrors.length===0,laterBranchErrors:laterBranchErrors.slice(0,20),traceabilityPolicy:"Every claim must remain grounded in Git, source, tests, migrations, or repository documentation through 2981db0 plus the clean reset checkpoint.",sizeBytes:statSync(file).size,practicalSize:statSync(file).size<25_000_000};
console.log(JSON.stringify(result,null,2));
if(!utf8Valid||!terminated||!result.declaredCountMatches||!result.sequentialNumbering||!result.noDuplicatePayloads||!result.privacyAndPaddingChecks||!result.branchPurityChecks||!result.practicalSize)process.exit(1);
