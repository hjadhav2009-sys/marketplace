import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import yazl from "yazl";
import { inspectAmazonConsignmentZip, validateAmazonArchiveEntryName } from "../src/lib/consignments/amazon/archive";
import { buildConsignmentCatalogSnapshot, parseConsignmentCatalogSnapshot } from "../src/lib/consignments/amazon/catalog-snapshot";
import { AMAZON_WORKBOOK_MAX_BYTES, classifyAmazonHeaders, parseAmazonBuffer, parseAmazonDelimitedRecords } from "../src/lib/consignments/amazon/parser";

const shipmentHeaders="Shipment ID,Shipment Name,Seller SKU,FNSKU,ASIN,Quantity,Destination";
const shipment=`${shipmentHeaders}\nSHIP-FAKE,Fake Shipment,SKU-FAKE,FNSKU-FAKE,B000FAKE01,3,FC-FAKE\n`;
const csv=await parseAmazonBuffer(Buffer.from(shipment),"arbitrary-name.csv");
assert.equal(csv.fileType,"AMAZON_SHIPMENT");assert.equal(csv.totalRows,1);assert.equal(csv.tables[0].rows[0].requiredQuantity,3);
const tsv=await parseAmazonBuffer(Buffer.from(shipment.replaceAll(",","\t")),"report.tsv");assert.equal(tsv.fileType,"AMAZON_SHIPMENT");
assert.equal(classifyAmazonHeaders(["Seller SKU","ASIN","Item Name","Listing Status"]).fileType,"AMAZON_ALL_LISTINGS");
assert.equal(classifyAmazonHeaders(["Seller SKU","ASIN","Item Name","Category","Brand"]).fileType,"AMAZON_CATEGORY_CATALOG");
assert.equal(classifyAmazonHeaders(["SKU"]).fileType,"UNKNOWN_SUPPORTING","One generic SKU header is never a shipment signature");
assert.equal((await parseAmazonBuffer(Buffer.from("SKU\nSKU-FAKE\n"),"shipment.csv")).fileType,"UNKNOWN_SUPPORTING","Filename cannot override contradictory headers");
assert.deepEqual(parseAmazonDelimitedRecords('A,B\n"quoted, value",2\n'),[["A","B"],["quoted, value","2"]]);

async function workbook(extension:"xlsx"|"xlsm") { const book=new ExcelJS.Workbook();const sheet=book.addWorksheet("Shipment");sheet.addRow(shipmentHeaders.split(","));sheet.addRow(["SHIP-FAKE","Fake Shipment","SKU-FAKE","FNSKU-FAKE","B000FAKE01",{formula:"1+2",result:3},"FC-FAKE"]);return parseAmazonBuffer(Buffer.from(await book.xlsx.writeBuffer()),`fake.${extension}`); }
assert.equal((await workbook("xlsx")).tables[0].rows[0].requiredQuantity,3);
assert.equal((await workbook("xlsm")).tables[0].rows[0].requiredQuantity,3,"XLSM reads cached cell data without executing formulas or macros");
await assert.rejects(()=>parseAmazonBuffer(Buffer.from("not a workbook"),"bad.xlsx"),/corrupt, encrypted, or unsupported/i);
await assert.rejects(()=>parseAmazonBuffer(Buffer.alloc(AMAZON_WORKBOOK_MAX_BYTES+1),"large.xlsx"),/size limit/i);

function makeZip(entries:Array<[string,string]>) { return new Promise<Buffer>((resolve,reject)=>{const zip=new yazl.ZipFile();for(const [name,value] of entries)zip.addBuffer(Buffer.from(value),name);const chunks:Buffer[]=[];zip.outputStream.on("data",(chunk:Buffer)=>chunks.push(chunk));zip.outputStream.on("error",reject);zip.outputStream.on("end",()=>resolve(Buffer.concat(chunks)));zip.end();}); }
const archive=await inspectAmazonConsignmentZip(await makeZip([["reports/shipment.csv",shipment],["reports/listings.csv","Seller SKU,ASIN,Item Name,Listing Status\nSKU-FAKE,B000FAKE01,Fake Product,Active\n"]]));assert.equal(archive.shipmentCandidates.length,1);assert.equal(archive.entries.length,2);
assert.throws(()=>validateAmazonArchiveEntryName("../escape.csv"),/unsafe entry path/i);
assert.throws(()=>validateAmazonArchiveEntryName("nested.zip"),/blocked, nested archive, or unsupported/i);
const multiple=await inspectAmazonConsignmentZip(await makeZip([["one.csv",shipment],["two.csv",shipment]]));assert.equal(multiple.shipmentCandidates.length,2,"Multiple shipment candidates require owner selection");

const snapshot=buildConsignmentCatalogSnapshot({marketplace:"AMAZON",title:"Fake Product",description:"x".repeat(5000),imageUrls:Array.from({length:12},(_,index)=>`https://example.invalid/${index}.png`),mainImageUrl:"file:///private/image.png",bulletPoints:Array.from({length:12},(_,index)=>`Point ${index}`),identifiers:{sellerSku:"SKU-FAKE",asin:"B000FAKE01"},provenance:{shipmentFileId:"safe-file-id"}});
assert.equal(snapshot.description?.length,4000);assert.equal(snapshot.imageUrls?.length,10);assert.equal(snapshot.mainImageUrl,undefined);assert.equal(snapshot.bulletPoints?.length,10);assert.equal(parseConsignmentCatalogSnapshot(JSON.stringify(snapshot))?.identifiers.asin,"B000FAKE01");assert.equal(parseConsignmentCatalogSnapshot("not json"),null);

const synthetic=[shipmentHeaders,...Array.from({length:10_000},(_,index)=>`SHIP-FAKE,Fake Shipment,SKU-${index},FNSKU-${index},B${String(index).padStart(9,"0")},1,FC-FAKE`)].join("\n");const started=performance.now();const large=await parseAmazonBuffer(Buffer.from(synthetic),"synthetic.csv");const elapsed=Math.round(performance.now()-started);assert.equal(large.totalRows,10_000);console.log(`Amazon 10,000-row synthetic parse: ${elapsed} ms.`);
console.log("Amazon parser, classification, workbook, archive, and snapshot tests passed.");
