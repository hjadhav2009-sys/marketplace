import assert from "node:assert/strict";
import { amazonShipmentCandidates, requireAmazonShipmentCandidate } from "../src/lib/consignments/amazon/candidate-policy";
import { AMAZON_STORED_REPARSE_MAX_FILES, AMAZON_STORED_REPARSE_MAX_SINGLE_FILE_BYTES, validateStoredAmazonReparseManifest } from "../src/lib/consignments/amazon/limits";

const candidateJson=JSON.stringify([
  {tableName:"Shipment",profile:"SHIPMENT",sheetUsage:"OPERATIONAL",sheetPriority:100,rowCount:10,cellCount:80},
  {tableName:"Examples",profile:"SHIPMENT",sheetUsage:"REFERENCE",sheetPriority:-100,rowCount:2,cellCount:16}
]);
assert.deepEqual(amazonShipmentCandidates(candidateJson).map((item)=>item.tableName),["Shipment"]);
assert.equal(requireAmazonShipmentCandidate(candidateJson,"Shipment").sheetUsage,"OPERATIONAL");
assert.throws(()=>requireAmazonShipmentCandidate(candidateJson,"Examples"),/not an operational shipment source/i);
assert.deepEqual(validateStoredAmazonReparseManifest([{fileSizeBytes:1024,entryName:null,candidateTablesJson:candidateJson}]),{fileCount:1,totalBytes:1024,totalCells:96,archiveFiles:0,shipmentCandidateCount:1});
assert.throws(()=>validateStoredAmazonReparseManifest(Array.from({length:AMAZON_STORED_REPARSE_MAX_FILES+1},()=>({fileSizeBytes:1,entryName:null,candidateTablesJson:null}))),/too many files/i);
assert.throws(()=>validateStoredAmazonReparseManifest([{fileSizeBytes:AMAZON_STORED_REPARSE_MAX_SINGLE_FILE_BYTES+1,entryName:null,candidateTablesJson:null}]),/size limit/i);
assert.throws(()=>validateStoredAmazonReparseManifest(Array.from({length:7},()=>({fileSizeBytes:AMAZON_STORED_REPARSE_MAX_SINGLE_FILE_BYTES,entryName:null,candidateTablesJson:null}))),/aggregate reparse size/i);
console.log("Amazon stored-reparse and candidate policy tests passed.");
