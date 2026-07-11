import yauzl, { type Entry, type ZipFile } from "yauzl";
import { classifyConsignmentTextFile } from "./parser";
import { CONSIGNMENT_ZIP_MAX_ENTRIES, CONSIGNMENT_ZIP_MAX_EXTRACTED_BYTES, validateArchiveEntryName } from "../storage";

export type SafeArchiveEntry = {
  entryName: string;
  fileType: ReturnType<typeof classifyConsignmentTextFile>;
  data: Buffer;
  uncompressedSize: number;
};

function openZip(buffer: Buffer) {
  return new Promise<ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, decodeStrings: true }, (error, zip) => error || !zip ? reject(error ?? new Error("Could not open ZIP.")) : resolve(zip));
  });
}

function readEntry(zip: ZipFile, entry: Entry) {
  return new Promise<Buffer>((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) { reject(error ?? new Error("Could not read ZIP entry.")); return; }
      const chunks: Buffer[] = [];
      let bytes = 0;
      stream.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > entry.uncompressedSize || bytes > CONSIGNMENT_ZIP_MAX_EXTRACTED_BYTES) stream.destroy(new Error("ZIP entry exceeds its declared size."));
        else chunks.push(chunk);
      });
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  });
}

export async function inspectFlipkartConsignmentZip(buffer: Buffer) {
  const zip = await openZip(buffer);
  return new Promise<{ entries: SafeArchiveEntry[]; mainCandidates: SafeArchiveEntry[] }>((resolve, reject) => {
    const entries: SafeArchiveEntry[] = [];
    let count = 0;
    let total = 0;
    let settled = false;
    const fail = (error: unknown) => { if (!settled) { settled = true; zip.close(); reject(error); } };
    zip.on("error", fail);
    zip.on("entry", async (entry: Entry) => {
      try {
        if (/\/$/.test(entry.fileName)) { zip.readEntry(); return; }
        count += 1;
        if (count > CONSIGNMENT_ZIP_MAX_ENTRIES) throw new Error("ZIP has too many entries.");
        if ((entry.generalPurposeBitFlag & 1) !== 0) throw new Error("Encrypted ZIP entries are not supported.");
        const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
        if ((unixMode & 0o170000) === 0o120000) throw new Error("ZIP symlink entries are not supported.");
        const entryName = validateArchiveEntryName(entry.fileName);
        total += entry.uncompressedSize;
        if (total > CONSIGNMENT_ZIP_MAX_EXTRACTED_BYTES) throw new Error("ZIP extracted content exceeds the configured limit.");
        const data = await readEntry(zip, entry);
        const text = data.toString("utf8");
        entries.push({ entryName, fileType: classifyConsignmentTextFile(entryName, text), data, uncompressedSize: data.length });
        zip.readEntry();
      } catch (error) { fail(error); }
    });
    zip.on("end", () => {
      if (settled) return;
      settled = true;
      const mainCandidates = entries.filter((entry) => entry.fileType === "CONSIGNMENT_DETAILS");
      resolve({ entries, mainCandidates });
    });
    zip.readEntry();
  });
}
