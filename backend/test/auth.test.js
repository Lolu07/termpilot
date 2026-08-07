import assert from "node:assert/strict";
import test from "node:test";

import {
  createSupabaseAuth,
  extractBearerToken,
  SupabaseConfigurationError,
} from "../src/auth.js";

function request(authorization) {
  return {
    get(name) {
      return name.toLowerCase() === "authorization" ? authorization : undefined;
    },
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("extractBearerToken accepts one bounded bearer token", () => {
  assert.equal(extractBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(extractBearerToken("bearer token"), "token");
  assert.equal(extractBearerToken("Basic token"), null);
  assert.equal(extractBearerToken("Bearer two tokens"), null);
  assert.equal(extractBearerToken(undefined), null);
});

test("Supabase auth requires its public runtime configuration", () => {
  assert.throws(
    () => createSupabaseAuth({ supabaseUrl: "", publishableKey: "" }),
    SupabaseConfigurationError,
  );
});

test("Supabase auth returns AUTH_REQUIRED before contacting Auth", async () => {
  let claimsCalls = 0;
  const middleware = createSupabaseAuth({
    supabaseUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    createClientImpl: () => ({
      auth: {
        async getClaims() {
          claimsCalls += 1;
          return { data: null, error: null };
        },
      },
    }),
  });
  const res = response();

  await middleware(request(), res, () => assert.fail("next must not run"));

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "AUTH_REQUIRED");
  assert.equal(claimsCalls, 0);
});

test("Supabase auth rejects invalid claims without creating a user client", async () => {
  let clientCalls = 0;
  const middleware = createSupabaseAuth({
    supabaseUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    createClientImpl: () => {
      clientCalls += 1;
      return {
        auth: {
          async getClaims(token) {
            assert.equal(token, "expired-token");
            return { data: null, error: new Error("expired") };
          },
        },
      };
    },
  });
  const res = response();

  await middleware(request("Bearer expired-token"), res, () => assert.fail("next must not run"));

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "AUTH_INVALID");
  assert.equal(clientCalls, 1);
});

test("Supabase auth verifies claims and creates an RLS-scoped client", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const calls = [];
  const verifier = {
    auth: {
      async getClaims(token) {
        assert.equal(token, "valid-token");
        return { data: { claims: { sub: userId, role: "authenticated" } }, error: null };
      },
    },
  };
  const userClient = { kind: "request-scoped" };
  const middleware = createSupabaseAuth({
    supabaseUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    createClientImpl(url, key, options) {
      calls.push({ url, key, options });
      return calls.length === 1 ? verifier : userClient;
    },
  });
  const req = request("Bearer valid-token");
  const res = response();
  let nextCalled = false;

  await middleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.auth.userId, userId);
  assert.equal(req.supabase, userClient);
  assert.equal(calls.length, 2);
  assert.equal(await calls[1].options.accessToken(), "valid-token");
  assert.equal(calls[1].options.auth.persistSession, false);
});
