import { buildWebEventScript } from "./webMessageInjector";

export function buildDownloadStatusScript(requestId: string, status: "started" | "complete" | "error", fileName?: string) {
  const type = status === "started" ? "DOWNLOAD_STARTED" : status === "complete" ? "DOWNLOAD_COMPLETE" : "DOWNLOAD_ERROR";
  return buildWebEventScript(type, requestId, { fileName: fileName?.slice(0, 120) });
}
