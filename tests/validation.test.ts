import assert from "node:assert/strict";
import { canAccessAccount, canRoleAccessPath } from "../lib/authz";
import { planOrderImport } from "../lib/import/orders";
import { planSkuMappingImport, type RawImportRow } from "../lib/import/sku-mappings";
import { getInitialProductImageState } from "../lib/product-image";
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
  qty: 1,
  color: "Silver",
  orderNo: "290010756104090432_1",
  productDescription: "Sports Jersey Number Personalized Pendant",
  paymentType: "UNKNOWN" as const,
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
    color: sampleOrder.color,
    active: true
  }).success,
  true,
  "SKU image mapping should validate"
);
assert.equal(loginSchema.safeParse({ username: "owner", password: "demo1234" }).success, true, "seed login should validate");
assert.equal(loginSchema.safeParse({ username: "", password: "short" }).success, false, "bad login should fail");

const skuImportRows: RawImportRow[] = [
  {
    SKU: "NEW_SKU",
    image: "https://images-r.meesho.com/images/products/1/sample.avif",
    name: "New Product"
  },
  {
    supplier_sku: "EXISTING_CHANGED",
    product_image_url: "https://images-r.meesho.com/images/products/2/new.avif"
  },
  {
    sku_code: "EXISTING_SAME",
    imageUrl: "https://images-r.meesho.com/images/products/3/same.avif"
  },
  {
    sku: "BAD_URL",
    image_url: "ftp://example.com/image.jpg"
  }
];

const skuPlan = planSkuMappingImport(
  [
    {
      sku: "EXISTING_CHANGED",
      imageUrl: "https://images-r.meesho.com/images/products/2/old.avif",
      productName: null,
      notes: null,
      active: true
    },
    {
      sku: "EXISTING_SAME",
      imageUrl: "https://images-r.meesho.com/images/products/3/same.avif",
      productName: null,
      notes: null,
      active: true
    }
  ],
  skuImportRows
);

assert.equal(skuPlan.created.length, 1, "SKU import creates new mapping");
assert.equal(skuPlan.updated.length, 1, "SKU import updates changed mapping");
assert.equal(skuPlan.unchanged.length, 1, "SKU import skips unchanged mapping");
assert.equal(skuPlan.errors[0]?.issueType, "INVALID_IMAGE_URL", "SKU import rejects invalid URL");

const orderPlan = planOrderImport(
  [
    {
      awb: "DUP_SAME",
      courier: "Delhivery",
      sku: "SKU1",
      qty: 1,
      color: "Silver",
      size: null,
      orderNo: "ORDER1",
      productDescription: "Pendant",
      paymentType: "UNKNOWN"
    },
    {
      awb: "DUP_CHANGED",
      courier: "Delhivery",
      sku: "SKU2",
      qty: 1,
      color: "Gold",
      size: null,
      orderNo: "ORDER2",
      productDescription: "Pendant",
      paymentType: "UNKNOWN"
    }
  ],
  [
    { awb: "NEW_AWB", sku: "SKU1", qty: 1, orderNo: "ORDER3" },
    { awb: "DUP_SAME", courier: "Delhivery", sku: "SKU1", qty: 1, color: "Silver", orderNo: "ORDER1", productDescription: "Pendant" },
    { awb: "DUP_CHANGED", courier: "Delhivery", sku: "SKU2", qty: 2, color: "Gold", orderNo: "ORDER2", productDescription: "Pendant" },
    { awb: "", sku: "SKU1", qty: 1, orderNo: "ORDER4" }
  ],
  new Set(["SKU1", "SKU2"])
);

assert.equal(orderPlan.created.length, 1, "Order import creates new AWB");
assert.equal(orderPlan.duplicates.length, 1, "Order import skips unchanged duplicate AWB");
assert.equal(orderPlan.updated.length, 1, "Order import updates changed duplicate safely");
assert.equal(orderPlan.errors[0]?.issueType, "MISSING_AWB", "Order import rejects missing AWB");

assert.equal(canRoleAccessPath("OWNER", "/reports"), true, "Owner can access reports");
assert.equal(canRoleAccessPath("PICKER", "/packing"), false, "Picker cannot access packing");
assert.equal(canRoleAccessPath("PACKER", "/problems"), true, "Packer can access problems");
assert.equal(canAccessAccount({ role: "PICKER", accountId: "a1" }, "a1"), true, "Assigned user can access account");
assert.equal(canAccessAccount({ role: "PICKER", accountId: "a1" }, "a2"), false, "Assigned user cannot access other account");

assert.equal(getInitialProductImageState(null), "missing", "Product image fallback handles missing URL");

console.log("Validation tests passed.");
