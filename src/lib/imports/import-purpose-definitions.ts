import type { Marketplace,MarketplaceImportPurpose } from "@prisma/client";
import type { ImportJobRecord } from "@/src/lib/import-jobs/store";

export type ImportFieldDefinition={key:string;label:string;targetHeader:string;required:boolean};
export type ImportPurposeDefinition={marketplace:Marketplace;purpose:MarketplaceImportPurpose;label:string;fields:ImportFieldDefinition[]};
const field=(key:string,label:string,targetHeader:string,required=false):ImportFieldDefinition=>({key,label,targetHeader,required});

export const IMPORT_PURPOSE_DEFINITIONS:ImportPurposeDefinition[]=[
 {marketplace:"FLIPKART",purpose:"DAILY_ORDER",label:"Flipkart Daily Orders",fields:[field("orderItemId","Order Item ID","ORDER ITEM ID",true),field("orderId","Order ID","Order Id",true),field("sellerSku","Seller SKU","SKU",true),field("quantity","Quantity","Quantity",true),field("trackingId","Tracking ID","Tracking ID",true),field("shipmentId","Shipment ID","Shipment ID"),field("fsn","FSN","FSN"),field("productTitle","Product Title","Product Title"),field("city","City","City"),field("state","State","State")]},
 {marketplace:"FLIPKART",purpose:"PRODUCT_CATALOG",label:"Flipkart Product Catalog",fields:[field("sellerSku","Seller SKU","Seller SKU Id",true),field("fsn","FSN","FSN"),field("listingId","Listing ID","Listing ID"),field("productTitle","Product Title","Product Title"),field("mainImageUrl","Main Image URL","Image URL 1")]},
 {marketplace:"FLIPKART",purpose:"CONSIGNMENT_QUANTITY",label:"Flipkart Consignment Quantity",fields:[field("productName","Product Name","Product Name",true),field("fsn","FSN","FSN",true),field("sellerSku","Seller SKU","SKU Id",true),field("quantity","Quantity Sent","Quantity Sent",true)]},
 {marketplace:"FLIPKART",purpose:"CONSIGNMENT_ENRICHMENT",label:"Flipkart Consignment Enrichment",fields:[field("sellerSku","Seller SKU","Seller SKU Id",true),field("fsn","FSN","FSN"),field("listingId","Listing ID","Listing ID"),field("productTitle","Product Title","Product Title"),field("mainImageUrl","Main Image URL","Image URL 1")]},
 {marketplace:"AMAZON",purpose:"PRODUCT_CATALOG",label:"Amazon Product Catalog",fields:[field("sellerSku","Merchant SKU","Merchant SKU",true),field("asin","ASIN","ASIN"),field("fnsku","FNSKU","FNSKU"),field("productTitle","Item Name","Item Name"),field("mainImageUrl","Main Image URL","Main Product Image")]},
 {marketplace:"AMAZON",purpose:"CONSIGNMENT_QUANTITY",label:"Amazon Consignment Quantity",fields:[field("sellerSku","Merchant SKU","Merchant SKU",true),field("asin","ASIN","ASIN",true),field("fnsku","FNSKU","FNSKU",true),field("quantity","Shipped Quantity","Shipped",true)]},
 {marketplace:"AMAZON",purpose:"CONSIGNMENT_ENRICHMENT",label:"Amazon Consignment Enrichment",fields:[field("sellerSku","Merchant SKU","Merchant SKU",true),field("asin","ASIN","ASIN"),field("fnsku","FNSKU","FNSKU"),field("productTitle","Item Name","Item Name"),field("mainImageUrl","Main Image URL","Main Product Image")]}
];

export function importPurposeDefinition(marketplace:Marketplace,purpose:MarketplaceImportPurpose){return IMPORT_PURPOSE_DEFINITIONS.find(item=>item.marketplace===marketplace&&item.purpose===purpose)??null;}
export function definitionForImportJob(job:Pick<ImportJobRecord,"marketplace"|"importType">){const marketplace=job.marketplace as Marketplace,purpose:MarketplaceImportPurpose=job.importType==="FLIPKART_ORDER"?"DAILY_ORDER":job.importType.endsWith("CONSIGNMENT_QUANTITY")?"CONSIGNMENT_QUANTITY":job.importType.endsWith("CONSIGNMENT_ENRICHMENT")?"CONSIGNMENT_ENRICHMENT":"PRODUCT_CATALOG";return importPurposeDefinition(marketplace,purpose);}
