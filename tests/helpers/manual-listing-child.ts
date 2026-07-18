import { prisma } from "../../lib/prisma";
import { createManualMarketplaceListing } from "../../src/lib/catalog/manual-listing";

type CreateInput = Parameters<typeof createManualMarketplaceListing>[0];
type ChildResult =
  | { ok: true; result: Awaited<ReturnType<typeof createManualMarketplaceListing>> }
  | { ok: false; error: string };

async function readInput() {
  let body = "";
  for await (const chunk of process.stdin) body += String(chunk);
  if (!body.trim()) throw new Error("Cross-process manual-listing input is missing.");
  return JSON.parse(body) as CreateInput;
}

process.stdout.write("READY\n");

let response: ChildResult;
try {
  response = { ok: true, result: await createManualMarketplaceListing(await readInput()) };
} catch (error) {
  response = { ok: false, error: error instanceof Error ? error.message : String(error) };
} finally {
  await prisma.$disconnect();
}

process.stdout.write(`RESULT ${JSON.stringify(response)}\n`);
