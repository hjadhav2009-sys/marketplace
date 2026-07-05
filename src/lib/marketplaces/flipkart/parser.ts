import type { MarketplaceOrderLine, MarketplaceParseResult, MarketplaceParseWarning } from "../common";

export type FlipkartParseInput = {
  fileName: string;
  source: "CSV" | "PDF_TEXT" | "UNKNOWN";
  text?: string;
};

export type FlipkartParseResult = MarketplaceParseResult & {
  marketplace: "FLIPKART";
  source: FlipkartParseInput["source"];
};

const placeholderWarning: MarketplaceParseWarning = {
  code: "FLIPKART_PARSER_PLACEHOLDER",
  message: "Flipkart parser structure is ready, but CSV/PDF field extraction is not implemented yet."
};

export function parseFlipkartFile(input: FlipkartParseInput): FlipkartParseResult {
  return {
    marketplace: "FLIPKART",
    fileName: input.fileName,
    source: input.source,
    orders: [] satisfies MarketplaceOrderLine[],
    warnings: [placeholderWarning]
  };
}

export function parseFlipkartCsvText(fileName: string, text: string) {
  return parseFlipkartFile({ fileName, source: "CSV", text });
}

export function parseFlipkartPdfText(fileName: string, text: string) {
  return parseFlipkartFile({ fileName, source: "PDF_TEXT", text });
}

