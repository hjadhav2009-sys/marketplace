import { prisma } from "../../lib/prisma";
import {
  resolveConsignmentMissingListing,
  resolveMissingListing,
  type ResolveConsignmentMissingListingInput,
  type ResolveMissingListingInput
} from "../../src/lib/catalog/missing-listing-resolution";

type ChildResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

async function readInput(): Promise<unknown> {
  let body = "";
  for await (const chunk of process.stdin) body += String(chunk);
  if (!body.trim()) throw new Error("Cross-process test input is missing.");
  return JSON.parse(body) as unknown;
}

process.stdout.write("READY\n");

let response: ChildResult;
try {
  const input = await readInput();
  response = {
    ok: true,
    result: process.env.RESOLUTION_RACE_KIND === "CONSIGNMENT"
      ? await resolveConsignmentMissingListing(input as ResolveConsignmentMissingListingInput)
      : await resolveMissingListing(input as ResolveMissingListingInput)
  };
} catch (error) {
  response = { ok: false, error: error instanceof Error ? error.message : String(error) };
} finally {
  await prisma.$disconnect();
}

process.stdout.write(`RESULT ${JSON.stringify(response)}\n`);
