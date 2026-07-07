export const PDF_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
export const FLIPKART_IMPORT_MAX_BYTES = 100 * 1024 * 1024;

export function isUploadTooLarge(file: Pick<File, "size">, maxBytes: number) {
  return file.size > maxBytes;
}
