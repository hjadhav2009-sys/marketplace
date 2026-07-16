import assert from "node:assert/strict";
import { parseAmazonOrderReport } from "../lib/parsers/amazon-orders";
import { planOrderImport } from "../lib/import/orders";

const report="amazon-order-id\tamazon-order-item-id\tshipment-id\ttracking-id\tseller-sku\tquantity-purchased\tproduct-name\tcarrier-name\nORDER-1\tITEM-1\tSHIP-1\tTRACK-1\tSKU-1\t2\tFake product\tFake carrier\n";
const rows=parseAmazonOrderReport(report,"orders.tsv");assert.equal(rows.length,1);assert.deepEqual(rows[0],{rowNumber:2,awb:"ITEM-1",trackingId:"TRACK-1",orderNo:"ORDER-1",orderItemId:"ITEM-1",shipmentId:"SHIP-1",sku:"SKU-1",qty:2,productDescription:"Fake product",courier:"Fake carrier",city:null,state:null});
const plan=planOrderImport([],rows,new Set(["SKU-1"]));assert.equal(plan.created.length,1);assert.equal(plan.errors.length,0);
assert.throws(()=>parseAmazonOrderReport("seller-sku,quantity\nSKU-1,99\n","catalog.csv"),/missing/i,"Catalog quantity cannot be accepted as customer-order work");
assert.throws(()=>parseAmazonOrderReport("amazon-order-id,amazon-order-item-id,tracking-id,seller-sku,quantity-purchased\nORDER-2,ITEM-2,,SKU-2,1\n","orders.csv"),/Tracking ID/i);
const multi=parseAmazonOrderReport("amazon-order-id,amazon-order-item-id,shipment-id,tracking-id,seller-sku,quantity-purchased\nORDER-3,ITEM-A,SHIP-A,TRACK-SHARED,SKU-A,1\nORDER-3,ITEM-B,SHIP-A,TRACK-SHARED,SKU-B,2\n","orders.csv");
assert.deepEqual(multi.map(row=>[row.awb,row.trackingId,row.orderItemId,row.sku]),[["ITEM-A","TRACK-SHARED","ITEM-A","SKU-A"],["ITEM-B","TRACK-SHARED","ITEM-B","SKU-B"]]);
const planned=planOrderImport([],multi,new Set(["SKU-A","SKU-B"]));assert.equal(planned.created.length,2);assert.equal(planned.duplicates.length,0,"Sibling shipment items are never collapsed as duplicate AWBs");
const existing=multi.map(row=>({awb:String(row.awb),courier:null,sku:String(row.sku),qty:Number(row.qty),color:null,size:null,orderNo:String(row.orderNo),productDescription:null,paymentType:"UNKNOWN" as const,shipmentId:row.shipmentId,orderItemId:row.orderItemId,trackingId:row.trackingId}));const replay=planOrderImport(existing,multi,new Set(["SKU-A","SKU-B"]));assert.equal(replay.created.length,0);assert.equal(replay.duplicates.length,2,"Identical item-level re-import is idempotent");
console.log("Amazon reviewed order report tests passed.");
