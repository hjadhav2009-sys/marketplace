import { z } from "zod";
import { isValidAwb, normalizeAwb } from "./awb";
import { normalizeUsername } from "./auth-helpers";
import { normalizeSkuForMatching } from "./sku";

export const loginSchema = z.object({
  username: z.preprocess(normalizeUsername, z.string().min(1, "Username is required")),
  password: z.string().min(6, "Password must be at least 6 characters")
});

export const accountSelectionSchema = z.object({
  accountId: z.string().min(1, "Choose an account")
});

export const marketplaceSchema = z.enum(["FLIPKART", "MEESHO", "AMAZON", "MYNTRA", "SHOPIFY", "WOOCOMMERCE", "OTHER"]);

export const ownerAccountSchema = z.object({
  accountId: z.string().optional(),
  companyName: z.string().trim().min(2, "Company name is required").max(80).default("Sullery"),
  marketplace: marketplaceSchema,
  accountDisplayName: z.string().trim().min(2, "Account name is required").max(80),
  accountCode: z
    .string()
    .trim()
    .min(2, "Account code is required")
    .max(40)
    .transform((value) => value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")),
  active: z.coerce.boolean().default(true),
  notes: z.string().trim().max(500).optional()
});

export const uploadBatchSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1, "Choose a PDF file")
    .refine((value) => value.toLowerCase().endsWith(".pdf"), "Only PDF uploads are supported")
});

export const skuImageMappingSchema = z.object({
  sku: z.preprocess(
    (value) => normalizeSkuForMatching(typeof value === "string" ? value : ""),
    z.string().min(1, "SKU is required")
  ),
  imageUrl: z
    .string()
    .trim()
    .url("Enter a valid image URL")
    .refine((value) => value.startsWith("http://") || value.startsWith("https://"), "Image URL must start with http:// or https://"),
  productName: z.string().trim().optional(),
  color: z.string().trim().optional(),
  size: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  active: z.coerce.boolean().default(true)
});

export const skuImageImportFileSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1, "Choose an import file")
    .refine(
      (value) => [".csv", ".xlsx"].some((extension) => value.toLowerCase().endsWith(extension)),
      "Upload a CSV or .xlsx Excel file"
    )
});

export const flipkartExcelImportFileSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1, "Choose a Flipkart Excel file")
    .refine((value) => value.toLowerCase().endsWith(".xlsx"), "Upload a Flipkart .xlsx Excel file")
});

export const flipkartOrderImportFileSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1, "Choose a Flipkart order file")
    .refine(
      (value) => [".xlsx", ".csv"].some((extension) => value.toLowerCase().endsWith(extension)),
      "Upload a Flipkart .xlsx Excel or .csv order file"
    )
});

export const awbSearchSchema = z.object({
  awb: z.preprocess(
    normalizeAwb,
    z.string().refine(isValidAwb, "Enter a valid AWB")
  )
});

export const parsedOrderSchema = z.object({
  awb: z.string().trim().min(8),
  courier: z.string().trim().optional(),
  sku: z.preprocess(
    (value) => normalizeSkuForMatching(typeof value === "string" ? value : ""),
    z.string().min(1)
  ),
  qty: z.coerce.number().int().positive(),
  color: z.string().trim().optional(),
  size: z.string().trim().optional(),
  orderNo: z.string().trim().min(1),
  productDescription: z.string().trim().optional(),
  paymentType: z.enum(["PREPAID", "COD", "UNKNOWN"]).default("UNKNOWN"),
  city: z.string().trim().optional(),
  state: z.string().trim().optional()
});

export const problemOrderSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().trim().min(3, "Reason is required"),
  details: z.string().trim().optional()
});
