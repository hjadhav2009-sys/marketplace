import { z } from "zod";
import { isValidAwb, normalizeAwb } from "./awb";

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(6, "Password must be at least 6 characters")
});

export const accountSelectionSchema = z.object({
  accountId: z.string().min(1, "Choose an account")
});

export const uploadBatchSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1, "Choose a PDF file")
    .refine((value) => value.toLowerCase().endsWith(".pdf"), "Only PDF uploads are supported")
});

export const skuImageMappingSchema = z.object({
  sku: z.string().trim().min(1, "SKU is required"),
  imageUrl: z
    .string()
    .trim()
    .url("Enter a valid image URL")
    .refine((value) => value.startsWith("http://") || value.startsWith("https://"), "Image URL must start with http:// or https://"),
  productName: z.string().trim().optional(),
  color: z.string().trim().optional(),
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

export const awbSearchSchema = z.object({
  awb: z.preprocess(
    normalizeAwb,
    z.string().refine(isValidAwb, "Enter a valid AWB")
  )
});

export const parsedOrderSchema = z.object({
  awb: z.string().trim().min(8),
  courier: z.string().trim().optional(),
  sku: z.string().trim().min(1),
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
