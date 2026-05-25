export type PdfTextPage = {
  pageNumber: number;
  text: string;
};

const PDF_EXTRACTION_STARTUP_ERROR = "PDF text extraction failed before pages could be read.";

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

type PdfJsWorkerModule = {
  WorkerMessageHandler?: unknown;
};

type PdfJsWorkerGlobal = typeof globalThis & {
  pdfjsWorker?: PdfJsWorkerModule;
};

type PdfParseFunction = (
  buffer: Buffer,
  options?: {
    pagerender?: (pageData: PdfPageData) => Promise<string>;
  }
) => Promise<PdfParseResult>;

async function ensurePdfJsFakeWorkerLoaded() {
  const workerGlobal = globalThis as PdfJsWorkerGlobal;

  if (workerGlobal.pdfjsWorker?.WorkerMessageHandler) {
    return;
  }

  const worker = (await import("pdfjs-dist/legacy/build/pdf.worker.mjs")) as PdfJsWorkerModule;

  if (!worker.WorkerMessageHandler) {
    throw new Error("PDF worker failed to load.");
  }

  workerGlobal.pdfjsWorker = worker;
}

function toStartupExtractionError(error: unknown) {
  const extractionError = new Error(PDF_EXTRACTION_STARTUP_ERROR);
  if (error instanceof Error) {
    extractionError.stack = `${extractionError.stack}\nCaused by: ${error.stack ?? error.message}`;
  }
  return extractionError;
}

export async function extractPdfPages(buffer: Buffer): Promise<PdfTextPage[]> {
  const pages: PdfTextPage[] = [];
  let pdfParseModule: PdfParseModule | PdfParseFunction;

  try {
    await ensurePdfJsFakeWorkerLoaded();
    pdfParseModule = (await import("pdf-parse")) as PdfParseModule | PdfParseFunction;
  } catch (error) {
    throw toStartupExtractionError(error);
  }

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
    } catch (error) {
      throw toStartupExtractionError(error);
    } finally {
      await parser.destroy();
    }
  }

  const parse = typeof pdfParseModule === "function" ? pdfParseModule : pdfParseModule.default;

  if (!parse) {
    throw new Error("PDF parser failed to load.");
  }

  let pageNumber = 0;
  let result: PdfParseResult;

  try {
    result = await parse(buffer, {
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
  } catch (error) {
    if (pages.length === 0) {
      throw toStartupExtractionError(error);
    }

    throw error;
  }

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
