import assert from "node:assert/strict";
import { buildFlipkartListingFormSchema } from "../src/lib/catalog/dynamic-form-profiles";
for(const field of ["bangle_size","diameter","model_name","sales_package","body_material","plating","brand_color"]){const profile=buildFlipkartListingFormSchema(["Listing Id","FSN","SKU","MRP","FSP",field]);assert.ok(profile,`${field} category profile is recognized`);assert.ok(profile.fields.some(item=>item.dynamicAttributeTarget===`flipkart.${field}`));assert.equal(profile.fields.find(item=>item.canonicalKey==="sellerSku")?.locallyOptional,false);}
console.log("Flipkart category form profile tests passed.");
