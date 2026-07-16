import assert from "node:assert/strict";
import { parseAmazonOrderReport } from "../lib/parsers/amazon-orders";
import { planOrderImport } from "../lib/import/orders";

const report="amazon-order-id\tamazon-order-item-id\tshipment-id\ttracking-id\tseller-sku\tquantity-purchased\tproduct-name\tcarrier-name\nORDER-1\tITEM-1\tSHIP-1\tTRACK-1\tSKU-1\t2\tFake product\tFake carrier\n";
const rows=parseAmazonOrderReport(report,"orders.tsv");assert.equal(rows.length,1);assert.deepEqual(rows[0],{rowNumber:2,awb:"TRACK-1",trackingId:"TRACK-1",orderNo:"ORDER-1",orderItemId:"ITEM-1",shipmentId:"SHIP-1",sku:"SKU-1",qty:2,productDescription:"Fake product",courier:"Fake carrier",city:null,state:null});
const plan=planOrderImport([],rows,new Set(["SKU-1"]));assert.equal(plan.created.length,1);assert.equal(plan.errors.length,0);
assert.throws(()=>parseAmazonOrderReport("seller-sku,quantity\nSKU-1,99\n","catalog.csv"),/missing/i,"Catalog quantity cannot be accepted as customer-order work");
assert.throws(()=>parseAmazonOrderReport("amazon-order-id,tracking-id,seller-sku,quantity-purchased\nORDER-2,,SKU-2,1\n","orders.csv"),/Tracking ID/i);
console.log("Amazon reviewed order report tests passed.");
