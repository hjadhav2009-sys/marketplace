/** Client-safe display and validation contract shared by Assembly surfaces. */
export const ORDER_ASSEMBLY_PROBLEM_CATEGORIES = [
  "PRODUCT_NOT_AVAILABLE",
  "WRONG_PRODUCT",
  "PART_MISSING",
  "ASSEMBLY_INSTRUCTION_MISSING",
  "ASSEMBLY_IMAGE_MISSING",
  "ASSEMBLY_FAILED",
  "DAMAGED_PRODUCT",
  "QUANTITY_MISMATCH",
  "OTHER"
] as const;
