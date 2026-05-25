export type MeeshoDetectedType = "LABEL_PDF" | "MANIFEST_PDF" | "UNKNOWN";
export type MeeshoPaymentType = "PREPAID" | "COD" | "UNKNOWN";
export type ParseIssueSeverity = "ERROR" | "WARNING";
export type MeeshoDetectedSection = "LABEL" | "MANIFEST_COURIER" | "PICKLIST_SUMMARY" | "UNKNOWN" | "EMPTY";

export type ParseIssue = {
  issueType: string;
  message: string;
  severity?: ParseIssueSeverity;
  pageNumber?: number;
  awb?: string;
  sku?: string;
};

export type ParsedMeeshoLabelOrder = {
  pageNumber: number;
  sourceType: "LABEL";
  supplierName?: string;
  courier?: string;
  awb?: string;
  sku?: string;
  qty?: number;
  color?: string;
  size?: string;
  orderNo?: string;
  purchaseOrderNo?: string;
  invoiceNo?: string;
  orderDate?: string;
  invoiceDate?: string;
  paymentType: MeeshoPaymentType;
  productDescription?: string;
  customerName?: string | null;
  city?: string | null;
  state?: string | null;
  rawText: string;
  confidence: number;
  issues: ParseIssue[];
};

export type ParsedMeeshoManifestOrder = {
  pageNumber: number;
  sourceType: "MANIFEST_ORDER";
  supplierName?: string;
  courier?: string;
  awb?: string;
  sku?: string;
  qty?: number;
  size?: string;
  orderNo?: string;
  rawRowText: string;
  confidence: number;
  issues: ParseIssue[];
};

export type ParsedMeeshoPicklistSummaryRow = {
  pageNumber: number;
  sourceType: "PICKLIST_SUMMARY";
  supplierName?: string;
  sku?: string;
  color?: string;
  size?: string;
  totalQuantity?: number;
  rawRowText: string;
  confidence: number;
  issues: ParseIssue[];
};

export type MeeshoParseStats = {
  totalPages: number;
  pagesWithText: number;
  pagesWithoutText: number;
  parsedOrders: number;
  parsedSummaryRows: number;
  missingAwb: number;
  missingSku: number;
  lowConfidenceRows: number;
  duplicateAwbInsideFile: number;
  duplicateSkuSummaryRows: number;
  unknownLayoutPages: number;
  scannedPdfLikely: boolean;
};

export type MeeshoPageExtractionDiagnostics = {
  pageNumber: number;
  textLength: number;
  hasProductDetails: boolean;
  hasTaxInvoice: boolean;
  hasPicklistTable: boolean;
  hasCourierTable: boolean;
  detectedSection: MeeshoDetectedSection;
  issues: string[];
};

export type MeeshoParserDiagnostics = {
  fileName: string;
  detectedType: MeeshoDetectedType;
  pageCount: number;
  pagesWithText: number;
  pagesWithoutText: number;
  parsedOrders: number;
  parsedSummaryRows: number;
  missingAwb: number;
  missingSku: number;
  lowConfidenceRows: number;
  duplicateAwbInsideFile: number;
  unknownLayoutPages: number;
  scannedPdfLikely: boolean;
  parserWarnings: string[];
  pageDiagnostics: MeeshoPageExtractionDiagnostics[];
};

export type MeeshoParseResult = {
  fileName: string;
  detectedType: MeeshoDetectedType;
  pageCount: number;
  labelOrders: ParsedMeeshoLabelOrder[];
  manifestOrders: ParsedMeeshoManifestOrder[];
  picklistSummaryRows: ParsedMeeshoPicklistSummaryRow[];
  issues: ParseIssue[];
  stats: MeeshoParseStats;
  diagnostics: MeeshoParserDiagnostics;
};

export type MeeshoTextPage = {
  pageNumber: number;
  text: string;
};

export type CrossCheckIssue = ParseIssue & {
  labelValue?: string | number;
  manifestValue?: string | number;
};
