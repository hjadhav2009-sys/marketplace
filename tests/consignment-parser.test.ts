import assert from "node:assert/strict";
import yazl from "yazl";
import { inspectFlipkartConsignmentZip } from "../src/lib/consignments/flipkart/archive";
import { classifyConsignmentTextFile, parseFlipkartConsignmentCsv } from "../src/lib/consignments/flipkart/parser";
import { decideConsignmentListingMatch } from "../src/lib/consignments/matching";
import { CONSIGNMENT_ZIP_MAX_BYTES, validateArchiveEntryName, validateConsignmentUpload } from "../src/lib/consignments/storage";

const headers="Product Name,FSN,SKU Id,Brand,Size,Style Code,Color,Isbn,Model Id,Quantity Sent,Quantity Received,Inwarded to Store,QC Fail,QC In Progress,QC Passed,Cost Price,Length(In cms),Breadth(In cms),Height(In cms),Weight(In kgs)";
const valid=`${headers}\nFake Product,FSN-1,SKU-1,Fake Brand,M,STYLE-1,Red,,MODEL-1,20,0,0,0,0,0,99.5,10,5,2,0.25\n`;
const parsed=parseFlipkartConsignmentCsv(valid);assert.equal(parsed.lines.length,1);assert.equal(parsed.lines[0].requiredQuantity,20);assert.equal(parsed.lines[0].costPriceReference,99.5);
const aliases=parseFlipkartConsignmentCsv(" product name , fsn ,SELLER SKU,Qty Sent\nFake,FSN-2,SKU-2,3\n");assert.equal(aliases.lines[0].sellerSkuSource,"SKU-2","Header aliases and casing work");
assert.throws(()=>parseFlipkartConsignmentCsv("Product Name,FSN,SKU Id\nFake,F,S\n"),/headers/i,"Missing Quantity Sent blocks parser");
const decimal=parseFlipkartConsignmentCsv(`${headers}\nFake,FSN-1,SKU-1,,,,,,,1.5\n`);assert.equal(decimal.lines.length,0);assert.equal(decimal.issues[0].issueType,"INVALID_QUANTITY");
const duplicate=parseFlipkartConsignmentCsv(`${headers}\nFake,FSN-1,SKU-1,Brand,M,,Red,,Model,2\nFake,FSN-1,SKU-1,Brand,M,,Red,,Model,3\n`);assert.equal(duplicate.lines.length,1);assert.equal(duplicate.lines[0].requiredQuantity,5);assert.equal(duplicate.issues[0].issueType,"DUPLICATE_AGGREGATED");
const conflict=parseFlipkartConsignmentCsv(`${headers}\nFake A,FSN-1,SKU-1,Brand,M,,Red,,Model,2\nFake B,FSN-1,SKU-1,Brand,M,,Red,,Model,3\n`);assert.equal(conflict.lines.length,2);assert.ok(conflict.issues.every((issue)=>issue.issueType==="DUPLICATE_IDENTITY_CONFLICT"));
assert.equal(classifyConsignmentTextFile("Quality_Check_fake.csv","QC Parameter,Required\n"),"QUALITY_CHECK_REFERENCE");
assert.equal(classifyConsignmentTextFile("Labels.csv","Category,Label Requirement\nFake,Yes\n"),"LABEL_REQUIREMENTS");
assert.throws(()=>validateArchiveEntryName("../private.csv"),/unsafe/i);
assert.throws(()=>validateArchiveEntryName("nested/archive.zip"),/blocked/i);
assert.throws(()=>validateConsignmentUpload({name:"large.zip",size:CONSIGNMENT_ZIP_MAX_BYTES+1} as File),/limit/i);

function makeZip(entries:Array<[string,string]>) { return new Promise<Buffer>((resolve,reject)=>{const zip=new yazl.ZipFile();for(const [name,text] of entries)zip.addBuffer(Buffer.from(text),name);const chunks:Buffer[]=[];zip.outputStream.on("data",(chunk:Buffer)=>chunks.push(chunk));zip.outputStream.on("error",reject);zip.outputStream.on("end",()=>resolve(Buffer.concat(chunks)));zip.end();});}
const archive=await inspectFlipkartConsignmentZip(await makeZip([["Consignment_Details_fake.csv",valid],["Labels.csv","Category,Label Requirement\nFake,Yes\n"],["Quality_Check_fake.csv","QC Parameter,Required\n"],["README.txt","Readme for fake export"]]));
assert.equal(archive.mainCandidates.length,1);assert.deepEqual(archive.entries.map((entry)=>entry.fileType),["CONSIGNMENT_DETAILS","LABEL_REQUIREMENTS","QUALITY_CHECK_REFERENCE","README"]);
const multiple=await inspectFlipkartConsignmentZip(await makeZip([["first.csv",valid],["second.csv",valid]]));assert.equal(multiple.mainCandidates.length,2,"Multiple header-matching main files require selection");

const listingA={id:"a",sellerSkuId:"SKU-A",sku:"A",fsn:"FSN-A",listingId:"L-A"};const listingB={id:"b",sellerSkuId:"SKU-B",sku:"B",fsn:"FSN-B",listingId:"L-B"};
assert.equal(decideConsignmentListingMatch([listingA],[listingA]).status,"EXACT_SKU","SKU and FSN confirmation selects one listing");
assert.equal(decideConsignmentListingMatch([listingA],[listingB]).status,"IDENTIFIER_CONFLICT","SKU/FSN conflict is blocked");
assert.equal(decideConsignmentListingMatch([listingA,listingB],[]).status,"EXACT_MULTIPLE","Ambiguous matches require owner selection");
assert.equal(decideConsignmentListingMatch([],[]).status,"NOT_FOUND","Unmatched rows remain for review");
console.log("Consignment parser and ZIP security tests passed.");
