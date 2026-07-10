import { buildWebEventScript } from "./webMessageInjector";

export function buildScannerResultScript(requestId: string, code: string, format?: string) {
  return buildWebEventScript("SCAN_RESULT", requestId, {
    code: code.trim().slice(0, 256),
    format: format?.slice(0, 40) ?? "unknown"
  });
}

export function buildScannerCancelledScript(requestId: string) {
  return buildWebEventScript("SCAN_CANCELLED", requestId, {});
}
