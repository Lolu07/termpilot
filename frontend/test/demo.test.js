import assert from "node:assert/strict";
import test from "node:test";

import { demoAuthErrorMessage, isDemoSession } from "../src/auth/demo.js";

test("isDemoSession recognizes only Supabase's boolean anonymous-user flag", () => {
  assert.equal(isDemoSession({ user: { is_anonymous: true } }), true);
  assert.equal(isDemoSession({ user: { is_anonymous: false } }), false);
  assert.equal(isDemoSession({ user: { is_anonymous: "true" } }), false);
  assert.equal(isDemoSession({ user: { user_metadata: { is_anonymous: true } } }), false);
  assert.equal(isDemoSession({ user: {} }), false);
  assert.equal(isDemoSession(null), false);
});

test("demoAuthErrorMessage explains when anonymous demo access is disabled", () => {
  const expected = "The live demo is not available yet. Please sign in with email or try again later.";

  assert.equal(demoAuthErrorMessage({ code: "anonymous_provider_disabled" }), expected);
  assert.equal(demoAuthErrorMessage({ code: "CONFIG-DISABLED" }), expected);
  assert.equal(demoAuthErrorMessage({ message: "Anonymous sign-ins are disabled" }), expected);
});

test("demoAuthErrorMessage turns demo rate limits into a retryable message", () => {
  const expected = "The live demo is busy right now. Please wait a moment and try again.";

  assert.equal(demoAuthErrorMessage({ status: 429 }), expected);
  assert.equal(demoAuthErrorMessage({ code: "over_request_rate_limit" }), expected);
});

test("demoAuthErrorMessage hides unexpected provider details", () => {
  const expected = "We could not start the live demo. Please try again.";

  assert.equal(demoAuthErrorMessage(new Error("sensitive upstream detail")), expected);
  assert.equal(demoAuthErrorMessage(null), expected);
});
