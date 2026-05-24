import assert from "node:assert/strict";
import {
  awbSearchSchema,
  loginSchema,
  parsedOrderSchema,
  skuImageMappingSchema,
  uploadBatchSchema
} from "../lib/validators";

const sampleOrder = {
  awb: "1490834915493571",
  courier: "Delhivery",
  sku: "1202919298_6",
  quantity: 1,
  color: "Silver",
  orderNumber: "290010756104090432_1",
  productDescription: "Sports Jersey Number Personalized Pendant",
  paymentType: "UNKNOWN",
  city: undefined,
  state: undefined
};

assert.equal(parsedOrderSchema.safeParse(sampleOrder).success, true, "seed order should validate");
assert.equal(awbSearchSchema.safeParse({ awb: sampleOrder.awb }).success, true, "seed AWB should validate");
assert.equal(uploadBatchSchema.safeParse({ filename: "labels.pdf" }).success, true, "PDF upload should validate");
assert.equal(uploadBatchSchema.safeParse({ filename: "labels.xlsx" }).success, false, "non-PDF upload should fail");
assert.equal(
  skuImageMappingSchema.safeParse({
    sku: sampleOrder.sku,
    imageUrl: "https://images-r.meesho.com/images/products/576264463/z71on.avif",
    productName: sampleOrder.productDescription,
    color: sampleOrder.color
  }).success,
  true,
  "SKU image mapping should validate"
);
assert.equal(loginSchema.safeParse({ username: "owner", password: "demo1234" }).success, true, "seed login should validate");
assert.equal(loginSchema.safeParse({ username: "", password: "short" }).success, false, "bad login should fail");

console.log("Validation tests passed.");
