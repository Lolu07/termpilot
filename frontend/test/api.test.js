import assert from "node:assert/strict";
import test from "node:test";

import { readResponse } from "../src/api.js";

test("readResponse surfaces actionable backend errors", async () => {
  const response = new Response(JSON.stringify({
    error: "No readable text was found in this PDF",
    code: "UNREADABLE_PDF",
    issues: [{ path: "file", message: "Use a text-based PDF." }],
  }), {
    status: 422,
    headers: { "content-type": "application/json" },
  });

  const error = await readResponse(response, "Generic failure").catch(reason => reason);
  assert.match(error.message, /No readable text was found in this PDF/);
  assert.equal(error.status, 422);
  assert.equal(error.code, "UNREADABLE_PDF");
  assert.deepEqual(error.issues, [{ path: "file", message: "Use a text-based PDF." }]);
});

test("readResponse falls back when the server has no JSON message", async () => {
  const response = new Response("Service unavailable", { status: 503 });
  await assert.rejects(() => readResponse(response, "Backend unavailable"), /Backend unavailable/);
});
