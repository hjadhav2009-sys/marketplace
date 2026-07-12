import path from "node:path";
import ExcelJS from "exceljs";
import type { ConsignmentImportFileType } from "@prisma/client";
import { AMAZON_HEADER_ALIASES, amazonHeaderIndex } from "./header-aliases";
import { safeAmazonImageUrl } from "./catalog-snapshot";
import type { AmazonConsignmentSourceRow, AmazonParsedFile, AmazonParsedTable, AmazonParserIssue, AmazonSheetUsage, AmazonSourceProfile } from "./types";

export const AMAZON_WORKBOOK_MAX_BYTES=25*1024*1024;
export const AMAZON_WORKBOOK_MAX_SHEETS=30;
export const AMAZON_WORKBOOK_MAX_ROWS_PER_SHEET=100_000;
export const AMAZON_WORKBOOK_MAX_COLUMNS=250;
export const AMAZON_WORKBOOK_MAX_CELL_LENGTH=20_000;
export const AMAZON_WORKBOOK_MAX_TOTAL_CELLS=2_000_000;
const HEADER_SCAN_ROWS=30;
const REFERENCE_SHEETS=/^(?:instructions?|data definitions?|valid values?|images?|examples?|dropdowns?(?: lists?)?|attributeptdmap|conditions?(?: lists?)?|feed processing summary|browse data|processing summary|changes to the template|read\s*me|help|guide)$/i;
const PREFERRED_SHEETS=/template|upload|product|inventory|listings?|data|feed/i;

export function classifyAmazonSheetUsage(sheetName:string):{sheetUsage:AmazonSheetUsage;sheetPriority:number}{const normalized=sheetName.normalize("NFKC").trim();if(REFERENCE_SHEETS.test(normalized))return{sheetUsage:"REFERENCE",sheetPriority:-100};if(PREFERRED_SHEETS.test(normalized))return{sheetUsage:"OPERATIONAL",sheetPriority:100};return{sheetUsage:"UNKNOWN",sheetPriority:0};}

function clean(value:unknown,max:number){const text=String(value??"").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g," ").trim();return text?text.slice(0,max):null;}
function positiveQuantity(value:unknown){const raw=clean(value,80)?.replace(/,/g,"");if(!raw||!/^\d+$/.test(raw))return null;const number=Number(raw);return Number.isSafeInteger(number)&&number>0?number:null;}
function cellText(value:unknown):string{
  if(value===null||value===undefined)return ""; if(value instanceof Date)return value.toISOString();
  if(typeof value==="string"||typeof value==="number"||typeof value==="boolean")return String(value).slice(0,AMAZON_WORKBOOK_MAX_CELL_LENGTH);
  if(typeof value==="object"){
    const cell=value as {formula?:unknown;result?:unknown;text?:unknown;richText?:Array<{text?:unknown}>;hyperlink?:unknown};
    if(cell.formula!==undefined)return cellText(cell.result);
    if(Array.isArray(cell.richText))return cell.richText.map((part)=>String(part.text??"")).join("").slice(0,AMAZON_WORKBOOK_MAX_CELL_LENGTH);
    if(cell.text!==undefined)return String(cell.text).slice(0,AMAZON_WORKBOOK_MAX_CELL_LENGTH);
  }
  return "";
}

export function parseAmazonDelimitedRecords(content:string,delimiter?:","|"\t"){
  const chosen=delimiter??((content.split(/\r?\n/,1)[0]?.match(/\t/g)?.length??0)>(content.split(/\r?\n/,1)[0]?.match(/,/g)?.length??0)?"\t":",");
  const rows:string[][]=[];let row:string[]=[];let value="";let quoted=false;let totalCells=0;const text=content.replace(/^\uFEFF/,"");
  for(let index=0;index<text.length;index+=1){const char=text[index];if(quoted){if(char==='"'&&text[index+1]==='"'){value+='"';index+=1;}else if(char==='"')quoted=false;else value+=char;}else if(char==='"')quoted=true;else if(char===chosen){row.push(value.slice(0,AMAZON_WORKBOOK_MAX_CELL_LENGTH));value="";}else if(char==='\n'){row.push(value.replace(/\r$/,"").slice(0,AMAZON_WORKBOOK_MAX_CELL_LENGTH));rows.push(row);row=[];value="";}else value+=char;if(rows.length>AMAZON_WORKBOOK_MAX_ROWS_PER_SHEET)throw new Error("Amazon text report has too many rows.");}
  if(quoted)throw new Error("Amazon text report contains an unterminated quoted value.");if(value||row.length){row.push(value.replace(/\r$/,"").slice(0,AMAZON_WORKBOOK_MAX_CELL_LENGTH));rows.push(row);}for(const item of rows){if(item.length>AMAZON_WORKBOOK_MAX_COLUMNS)throw new Error("Amazon text report has too many columns.");totalCells+=item.length;if(totalCells>AMAZON_WORKBOOK_MAX_TOTAL_CELLS)throw new Error("Amazon text report contains too many cells.");}return rows;
}

function has(headers:string[],key:keyof typeof AMAZON_HEADER_ALIASES){return amazonHeaderIndex(headers,AMAZON_HEADER_ALIASES[key])>=0;}
export function classifyAmazonHeaders(headers:string[]):{profile:AmazonSourceProfile;fileType:ConsignmentImportFileType;confidence:number}{
  const identity=["sellerSku","fnsku","asin","externalId","ean","upc","gtin"].filter((key)=>has(headers,key as keyof typeof AMAZON_HEADER_ALIASES)).length;
  const shipment=(has(headers,"shipmentId")||has(headers,"shipmentName"))&&has(headers,"quantity")&&identity>=1;
  if(shipment)return{profile:"SHIPMENT",fileType:"AMAZON_SHIPMENT",confidence:95};
  const enriched=["brand","material","description","mainImage","bullet1","modelNumber"].filter((key)=>has(headers,key as keyof typeof AMAZON_HEADER_ALIASES)).length;
  if(identity>=1&&has(headers,"title")&&has(headers,"category")&&enriched>=1)return{profile:"CATEGORY_CATALOG",fileType:"AMAZON_CATEGORY_CATALOG",confidence:85};
  if(has(headers,"sellerSku")&&(has(headers,"asin")||has(headers,"fnsku"))&&has(headers,"listingStatus"))return{profile:"ALL_LISTINGS",fileType:"AMAZON_ALL_LISTINGS",confidence:90};
  if(identity>=1&&has(headers,"title")&&enriched>=1)return{profile:"PRODUCT_CATALOG",fileType:"AMAZON_PRODUCT_CATALOG",confidence:75};
  if(identity>=2||identity>=1&&enriched>=1)return{profile:"SUPPORTING",fileType:"AMAZON_SUPPORTING",confidence:45};
  return{profile:"UNKNOWN",fileType:"UNKNOWN_SUPPORTING",confidence:0};
}

export type AmazonHeaderLayout={headerRow:number;labelRow?:number;dataRow:number;headers:string[];classification:ReturnType<typeof classifyAmazonHeaders>};
function metadataRowNumber(records:string[][],key:"attributeRow"|"labelRow"|"dataRow") { const expression=new RegExp(`${key}\\s*[:=]?\\s*(\\d+)`,`i`);for(const row of records.slice(0,10)){const match=row.join(" ").match(expression);if(match){const number=Number(match[1]);if(Number.isInteger(number)&&number>0&&number<=records.length)return number;}}return undefined; }
function machineHeaderScore(headers:string[]) { return headers.reduce((score,header)=>score+(header.includes("_")||/^(item|feed|external|main|other|bullet|brand|model|color|size|material)_/i.test(header)?2:0),0); }
function layoutScore(headers:string[]) { const classification=classifyAmazonHeaders(headers);const known=Object.values(AMAZON_HEADER_ALIASES).filter((aliases)=>amazonHeaderIndex(headers,aliases)>=0).length;return classification.confidence*100+known*10+machineHeaderScore(headers); }
export function resolveAmazonHeaderLayout(records:string[][]):AmazonHeaderLayout {
  if(!records.length)return{headerRow:1,dataRow:2,headers:[],classification:classifyAmazonHeaders([])};
  const attributeRow=metadataRowNumber(records,"attributeRow");const labelRow=metadataRowNumber(records,"labelRow");const metadataDataRow=metadataRowNumber(records,"dataRow");
  if(attributeRow){const headers=(records[attributeRow-1]??[]).map((value)=>clean(value,300)??"");const classification=classifyAmazonHeaders(headers);if(classification.confidence>0)return{headerRow:attributeRow,labelRow,dataRow:metadataDataRow&&metadataDataRow>attributeRow?metadataDataRow:attributeRow+1,headers,classification};}
  const candidates=records.slice(0,HEADER_SCAN_ROWS).map((record,index)=>{const headers=record.map((value)=>clean(value,300)??"");return{headers,index,score:layoutScore(headers),classification:classifyAmazonHeaders(headers)};}).filter((item)=>item.classification.confidence>0).sort((left,right)=>right.score-left.score||left.index-right.index);
  const best=candidates[0];if(!best){const headers=(records[0]??[]).map((value)=>clean(value,300)??"");return{headerRow:1,dataRow:2,headers,classification:classifyAmazonHeaders(headers)};}
  return{headerRow:best.index+1,dataRow:best.index+2,headers:best.headers,classification:best.classification};
}

function rowValue(row:string[],headers:string[],key:keyof typeof AMAZON_HEADER_ALIASES){const index=amazonHeaderIndex(headers,AMAZON_HEADER_ALIASES[key]);return index>=0?row[index]:undefined;}
function normalizedRow(row:string[],headers:string[],rowNumber:number,sheet:string,profile:AmazonSourceProfile):AmazonConsignmentSourceRow{
  const bulletPoints=["bullet1","bullet2","bullet3","bullet4","bullet5"].map((key)=>clean(rowValue(row,headers,key as keyof typeof AMAZON_HEADER_ALIASES),500)).filter((value):value is string=>Boolean(value));
  const imageUrls=Array.from({length:10},(_,index)=>safeAmazonImageUrl(rowValue(row,headers,`otherImage${index+1}` as keyof typeof AMAZON_HEADER_ALIASES))).filter((value):value is string=>Boolean(value));
  const mainImageUrl=safeAmazonImageUrl(rowValue(row,headers,"mainImage"))??null;
  return{rowNumber,shipmentId:clean(rowValue(row,headers,"shipmentId"),200),shipmentName:clean(rowValue(row,headers,"shipmentName"),200),destinationText:clean(rowValue(row,headers,"destination"),500),sellerSku:clean(rowValue(row,headers,"sellerSku"),200),fnsku:clean(rowValue(row,headers,"fnsku"),100),asin:clean(rowValue(row,headers,"asin"),20),externalId:clean(rowValue(row,headers,"externalId"),200),ean:clean(rowValue(row,headers,"ean"),100),upc:clean(rowValue(row,headers,"upc"),100),gtin:clean(rowValue(row,headers,"gtin"),100),requiredQuantity:positiveQuantity(rowValue(row,headers,"quantity")),productTitle:clean(rowValue(row,headers,"title"),500),brand:clean(rowValue(row,headers,"brand"),160),category:clean(rowValue(row,headers,"category"),200),subCategory:clean(rowValue(row,headers,"subCategory"),200),material:clean(rowValue(row,headers,"material"),200),color:clean(rowValue(row,headers,"color"),120),size:clean(rowValue(row,headers,"size"),120),modelNumber:clean(rowValue(row,headers,"modelNumber"),160),description:clean(rowValue(row,headers,"description"),4000),bulletPoints,mainImageUrl,imageUrls:[...new Set([mainImageUrl,...imageUrls].filter((value):value is string=>Boolean(value)))].slice(0,10),listingStatus:clean(rowValue(row,headers,"listingStatus"),100),sourceFileId:null,sourceSheet:sheet,sourceProfile:profile};
}

function tableFromRows(sheet:string,records:string[][]):AmazonParsedTable{
  const layout=resolveAmazonHeaderLayout(records);const headers=layout.headers;const classification=layout.classification;const usage=classifyAmazonSheetUsage(sheet);const rows:AmazonConsignmentSourceRow[]=[];const issues:AmazonParserIssue[]=[];
  for(let index=layout.dataRow-1;index<records.length;index+=1){const source=records[index];if(source.every((cell)=>!cell.trim()))continue;const row=normalizedRow(source,headers,index+1,sheet,classification.profile);const identifiers=[row.sellerSku,row.fnsku,row.asin,row.externalId,row.ean,row.upc,row.gtin].filter(Boolean);if(classification.profile==="SHIPMENT"&&(!row.requiredQuantity||!identifiers.length)){issues.push({rowNumber:index+1,sheet,issueType:!row.requiredQuantity?"INVALID_QUANTITY":"MISSING_IDENTIFIER",severity:"ERROR",message:!row.requiredQuantity?"Amazon shipment quantity must be a positive whole number.":"Amazon shipment row needs at least one exact identifier."});continue;}rows.push(row);}
  return{sheet,...usage,headers,profile:classification.profile,fileType:classification.fileType,confidence:classification.confidence,headerRow:layout.headerRow,labelRow:layout.labelRow,dataRow:layout.dataRow,rows,issues};
}

async function workbookTables(buffer:Buffer){if(buffer.length>AMAZON_WORKBOOK_MAX_BYTES)throw new Error("Amazon workbook exceeds the configured size limit.");const workbook=new ExcelJS.Workbook();try{await workbook.xlsx.load(buffer as never);}catch{throw new Error("Amazon workbook is corrupt, encrypted, or unsupported.");}if(workbook.worksheets.length>AMAZON_WORKBOOK_MAX_SHEETS)throw new Error("Amazon workbook has too many sheets.");const tables:AmazonParsedTable[]=[];let totalCells=0;for(const sheet of workbook.worksheets){if(sheet.rowCount>AMAZON_WORKBOOK_MAX_ROWS_PER_SHEET||sheet.columnCount>AMAZON_WORKBOOK_MAX_COLUMNS)throw new Error("Amazon workbook exceeds row or column limits.");totalCells+=sheet.rowCount*sheet.columnCount;if(totalCells>AMAZON_WORKBOOK_MAX_TOTAL_CELLS)throw new Error("Amazon workbook contains too many cells.");const records=Array.from({length:sheet.rowCount},(_,rowIndex)=>Array.from({length:Math.min(sheet.columnCount,AMAZON_WORKBOOK_MAX_COLUMNS)},(_,columnIndex)=>cellText(sheet.getRow(rowIndex+1).getCell(columnIndex+1).value)));if(records.some((record)=>record.some(Boolean)))tables.push(tableFromRows(clean(sheet.name,100)??"Sheet",records));}return tables;}

export async function parseAmazonBuffer(buffer:Buffer,fileName:string):Promise<AmazonParsedFile>{const extension=path.extname(fileName).toLowerCase();let tables:AmazonParsedTable[];if(extension===".xlsx"||extension===".xlsm")tables=await workbookTables(buffer);else if([".csv",".tsv",".txt"].includes(extension)){if(buffer.length>AMAZON_WORKBOOK_MAX_BYTES)throw new Error("Amazon text report exceeds the configured size limit.");tables=[tableFromRows("Text report",parseAmazonDelimitedRecords(buffer.toString("utf8"),extension===".tsv"?"\t":undefined))];}else throw new Error("Unsupported Amazon file type. Use CSV, TSV, TXT, XLSX, XLSM, or ZIP.");const usable=tables.filter((table)=>table.sheetUsage!=="REFERENCE");const ranked=[...usable].sort((left,right)=>right.confidence-left.confidence||right.sheetPriority-left.sheetPriority||left.sheet.localeCompare(right.sheet));return{fileName,fileType:ranked[0]?.fileType??"UNKNOWN_SUPPORTING",tables,shipmentCandidateCount:usable.filter((table)=>table.fileType==="AMAZON_SHIPMENT").length,totalRows:usable.reduce((sum,table)=>sum+table.rows.length,0)};}

export function amazonSourceRows(parsed:AmazonParsedFile,profile?:AmazonSourceProfile,options?:{includeReference?:boolean}){return parsed.tables.filter((table)=>(options?.includeReference===true||table.sheetUsage!=="REFERENCE")&&(!profile||table.profile===profile)).flatMap((table)=>table.rows);}
