import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { privateStreamResponse } from "../src/lib/files/private-stream-response";

const bytes = Buffer.from("fake private marking bytes", "utf8");
const response = privateStreamResponse(Readable.from(bytes), {
  fileName: "../unsafe/fake-marking.file",
  contentType: "application/octet-stream"
});

assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes, "The streamed response returns the original bytes");
assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
assert.equal(response.headers.get("x-content-type-options"), "nosniff");
assert.doesNotMatch(response.headers.get("content-disposition") ?? "", /[\\/]/, "No managed or absolute path is exposed");
assert.match(response.headers.get("content-disposition") ?? "", /unsafe_fake-marking\.file/);

console.log("Private workflow stream response test passed.");
