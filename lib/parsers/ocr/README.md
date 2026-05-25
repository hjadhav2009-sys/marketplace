# OCR Parser Interface

The current Meesho parser is text-based. When diagnostics mark a file as `scannedPdfLikely`, the PDF probably contains
page images instead of selectable text and needs OCR before the normal label or manifest parser can run.

Sprint 6 adds only the OCR-ready TypeScript interface in `types.ts`. Heavy OCR is intentionally not implemented yet so
local production stays free-first, lightweight, and predictable.

Expected future flow:

1. Render each scanned PDF page to an image.
2. Pass each image to an `OcrExtractor`.
3. Convert OCR text into the existing `MeeshoTextPage[]` shape.
4. Run the same diagnostics, label parser, manifest parser, and review screen.
