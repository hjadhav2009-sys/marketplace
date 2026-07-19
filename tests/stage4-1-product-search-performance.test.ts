import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createTempWorkflowDb } from "./temp-workflow-db";
import { searchProductInventory } from "../src/lib/product-inventory/search";

const{db,cleanup}=createTempWorkflowDb("stage4-1-product-search-performance"),count=30_000;
const percentile=(values:number[],p:number)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)];
try{
 await db.account.create({data:{id:"catalog",name:"Synthetic Catalog",code:"CAT",marketplace:"FLIPKART"}});
 for(let start=0;start<count;start+=500){const end=Math.min(count,start+500);await db.marketplaceListing.createMany({data:Array.from({length:end-start},(_,offset)=>{const index=start+offset;return{id:`listing-${index}`,accountId:"catalog",marketplace:"FLIPKART",sellerSkuId:`PERF-SKU-${String(index).padStart(6,"0")}`,sku:`INT-${String(index).padStart(6,"0")}`,fsn:`PERF-FSN-${index}`,listingId:`PERF-LISTING-${index}`,productTitle:`Synthetic catalog product ${index}`,listingStatus:"ACTIVE"};})});}
 const query="PERF-SKU-029999";await searchProductInventory(db,{accountId:"catalog",query});const timings:number[]=[];for(let index=0;index<20;index++){const started=performance.now(),result=await searchProductInventory(db,{accountId:"catalog",query});timings.push(performance.now()-started);assert.equal(result.listings[0]?.sellerSkuId,query);assert.equal(result.exactCount,1);}const p95=percentile(timings,.95);assert.ok(p95<=500,`Exact Product Inventory search p95 ${p95.toFixed(1)}ms exceeds 500ms`);console.log(`Product Inventory ${count}-listing exact search p50=${percentile(timings,.5).toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${Math.max(...timings).toFixed(1)}ms.`);
}finally{await cleanup();}
console.log("Stage 4.1 Product Inventory performance test passed.");
