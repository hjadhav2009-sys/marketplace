import type { ParsedOrderImportRow } from "@/lib/import/orders";
import { parseAmazonDelimitedRecords } from "@/src/lib/consignments/amazon/parser";

const aliases={orderNo:["amazon-order-id","order-id","order id"],orderItemId:["amazon-order-item-id","order-item-id","order item id"],shipmentId:["shipment-id","shipment id"],trackingId:["tracking-id","tracking id","tracking-number","tracking number"],sku:["sku","seller-sku","seller sku"],qty:["quantity-purchased","quantity","qty"],title:["product-name","item-name","title"],courier:["carrier-name","carrier","courier"],city:["ship-city","city"],state:["ship-state","state"]} as const;
const normalize=(value:string)=>value.normalize("NFKC").trim().toLowerCase().replace(/[_\s]+/g,"-");
function index(headers:string[],names:readonly string[]){const accepted=new Set(names.map(normalize));return headers.findIndex(header=>accepted.has(normalize(header)));}
function value(row:string[],headers:string[],key:keyof typeof aliases){const at=index(headers,aliases[key]);return at<0?"":String(row[at]??"").normalize("NFKC").trim();}

export function parseAmazonOrderReport(content:string,fileName="amazon-orders.csv"):ParsedOrderImportRow[]{
 const delimiter=fileName.toLowerCase().endsWith(".tsv")||fileName.toLowerCase().endsWith(".txt")?"\t":undefined;const records=parseAmazonDelimitedRecords(content,delimiter);const headers=records[0]??[];
 for(const required of ["orderNo","orderItemId","trackingId","sku","qty"] as const)if(index(headers,aliases[required])<0)throw new Error(`Amazon order report is missing ${required}.`);
 return records.slice(1).flatMap((row,offset)=>{if(row.every(cell=>!cell.trim()))return[];const quantity=value(row,headers,"qty");if(!/^\d+$/.test(quantity)||Number(quantity)<=0)throw new Error(`Amazon order row ${offset+2} has an invalid quantity.`);const trackingId=value(row,headers,"trackingId");if(!trackingId)throw new Error(`Amazon order row ${offset+2} is missing Tracking ID.`);const orderItemId=value(row,headers,"orderItemId");if(!orderItemId)throw new Error(`Amazon order row ${offset+2} is missing Amazon Order Item ID.`);return[{rowNumber:offset+2,awb:orderItemId,trackingId,orderNo:value(row,headers,"orderNo"),orderItemId,shipmentId:value(row,headers,"shipmentId")||null,sku:value(row,headers,"sku"),qty:Number(quantity),productDescription:value(row,headers,"title")||null,courier:value(row,headers,"courier")||null,city:value(row,headers,"city")||null,state:value(row,headers,"state")||null}];});
}
