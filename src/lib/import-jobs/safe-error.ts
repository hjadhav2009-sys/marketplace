function sanitizeError(error: unknown, unsafeFallback: string, maxLength: number) {
  const value = error instanceof Error ? error.message : typeof error === "string" ? error : null;
  if (!value) return null;
  const normalized = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]+/g, " ");
  const containsPath = /file:\/{1,3}/i.test(normalized)
    || /\\\\[^\\\r\n]+\\/i.test(normalized)
    || /\b[A-Z]:[\\/]/i.test(normalized)
    || /(^|[\s("'`=:])\/(?!\/)/.test(normalized);
  const containsDatabaseInternal = /PrismaClient(?:KnownRequestError|UnknownRequestError|RustPanicError|InitializationError|ValidationError)|\bP\d{4}\b|\bSQLITE_[A-Z_]+\b|database is locked|constraint failed|\b(?:SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+.+\s+SET|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE)\b/i.test(normalized);
  const sanitized = (containsPath || containsDatabaseInternal ? unsafeFallback : normalized)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const boundedLength = Math.min(Math.max(Math.trunc(maxLength) || 500, 1), 1000);
  return (sanitized || unsafeFallback).slice(0, boundedLength);
}

export function sanitizePublicActionError(error: unknown, unsafeFallback: string, maxLength = 500) {
  const fallback = unsafeFallback.normalize("NFKC").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 500)
    || "The operation failed. Review it and retry when safe.";
  return sanitizeError(error, fallback, maxLength);
}

export function sanitizeImportJobError(error: unknown, maxLength = 500) {
  return sanitizeError(error, "Import failed. Review the job and retry when safe.", maxLength);
}
