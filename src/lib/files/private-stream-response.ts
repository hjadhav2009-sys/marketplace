import { Readable } from "node:stream";

function safeDownloadName(name: string) {
  return name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "download";
}

export function privateStreamResponse(stream: Readable, options: { fileName: string; contentType?: string; disposition?: "inline" | "attachment" }) {
  const fileName = safeDownloadName(options.fileName);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `${options.disposition ?? "attachment"}; filename="${fileName}"`,
      "Content-Type": options.contentType ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
