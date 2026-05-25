export type OcrProviderName = "LOCAL_TESSERACT" | "EXTERNAL_SERVICE";

export type OcrPageInput = {
  fileName: string;
  pageNumber: number;
  imageBytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg";
};

export type OcrPageResult = {
  pageNumber: number;
  text: string;
  confidence?: number;
  warnings?: string[];
};

export type OcrExtractor = {
  name: OcrProviderName;
  extractPageText(input: OcrPageInput): Promise<OcrPageResult>;
};
