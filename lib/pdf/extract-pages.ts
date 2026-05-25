export type PdfTextPage = {
  pageNumber: number;
  text: string;
};

type PdfTextItem = {
  str?: string;
};

type PdfPageData = {
  getTextContent(options?: Record<string, unknown>): Promise<{
    items: PdfTextItem[];
  }>;
};

type PdfParseResult = {
  numpages?: number;
  text?: string;
};

type PdfParseTextResult = {
  total?: number;
  text?: string;
  pages?: Array<{
    num: number;
    text: string;
  }>;
};

type PdfParseClass = new (options: { data: Buffer | Uint8Array }) => {
  getText(params?: Record<string, unknown>): Promise<PdfParseTextResult>;
  destroy(): Promise<void>;
};

type PdfParseModule = {
  default?: PdfParseFunction;
  PDFParse?: PdfParseClass;
};

type PdfParseFunction = (
  buffer: Buffer,
  options?: {
    pagerender?: (pageData: PdfPageData) => Promise<string>;
  }
) => Promise<PdfParseResult>;

export async function extractPdfPages(buffer: Buffer): Promise<PdfTextPage[]> {
  const pages: PdfTextPage[] = [];
  const pdfParseModule = (await import("pdf-parse")) as PdfParseModule | PdfParseFunction;

  if (typeof pdfParseModule !== "function" && pdfParseModule.PDFParse) {
    const parser = new pdfParseModule.PDFParse({ data: buffer });

    try {
      const result = await parser.getText();

      if (result.pages?.length) {
        return result.pages.map((page) => ({
          pageNumber: page.num,
          text: page.text
        }));
      }

      if (result.text) {
        return [{ pageNumber: 1, text: result.text }];
      }

      if (result.total && result.total > 0) {
        return Array.from({ length: result.total }, (_, index) => ({
          pageNumber: index + 1,
          text: ""
        }));
      }

      return [];
    } finally {
      await parser.destroy();
    }
  }

  const parse = typeof pdfParseModule === "function" ? pdfParseModule : pdfParseModule.default;

  if (!parse) {
    throw new Error("PDF parser failed to load.");
  }

  let pageNumber = 0;
  const result = await parse(buffer, {
    pagerender: async (pageData) => {
      pageNumber += 1;
      const content = await pageData.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false
      });
      const text = content.items.map((item) => item.str ?? "").join("\n");
      pages.push({ pageNumber, text });
      return text;
    }
  });

  if (pages.length === 0 && result.text) {
    return [{ pageNumber: 1, text: result.text }];
  }

  if (pages.length === 0 && result.numpages && result.numpages > 0) {
    return Array.from({ length: result.numpages }, (_, index) => ({
      pageNumber: index + 1,
      text: ""
    }));
  }

  return pages;
}
