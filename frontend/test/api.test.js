import assert from "node:assert/strict";
import test from "node:test";

import { configureApiAuth, getCourses, readResponse } from "../src/api.js";

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

test("API requests attach the active Supabase bearer token", async () => {
  const originalFetch = globalThis.fetch;
  let receivedAuthorization = "";
  configureApiAuth({
    getAccessToken: async () => "session-token",
    baseUrl: "https://api.example.test/api",
  });
  globalThis.fetch = async (_url, options) => {
    receivedAuthorization = new Headers(options.headers).get("authorization");
    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    assert.deepEqual(await getCourses(), []);
    assert.equal(receivedAuthorization, "Bearer session-token");
  } finally {
    globalThis.fetch = originalFetch;
    configureApiAuth();
  }
});

test("API requests fail closed when there is no active session", async () => {
  configureApiAuth({ baseUrl: "https://api.example.test/api" });
  const error = await getCourses().catch(reason => reason);
  assert.equal(error.status, 401);
  assert.equal(error.code, "AUTH_REQUIRED");
  configureApiAuth();
});

test("API requests fail clearly instead of falling back to production", async () => {
  configureApiAuth({ getAccessToken: async () => "session-token" });
  const error = await getCourses().catch(reason => reason);
  assert.equal(error.code, "CONFIGURATION_ERROR");
  assert.match(error.message, /API URL is not configured/);
  configureApiAuth();
});
