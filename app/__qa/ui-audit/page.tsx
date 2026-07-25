import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { AuditStudio, type AuditResult } from "./AuditStudio";

export const dynamic = "force-dynamic";

export default async function UiAuditPage() {
  if (process.env.STAGING_UI_AUDIT !== "true" || process.env.STAGE3_SYNTHETIC_STAGING !== "true") notFound();
  const resultPath = path.join(process.cwd(), ".codex-tmp", "stage4-2b", "browser-results.json");
  let results: AuditResult[] = [];
  try {
    const parsed = JSON.parse(await readFile(resultPath, "utf8")) as { results?: AuditResult[] };
    results = parsed.results ?? [];
  } catch {}
  return <AuditStudio initialResults={results}/>;
}

