import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { RepositoryError } from "../src/repository.js";
import { createApp } from "../src/server.js";

const userId = "11111111-1111-4111-8111-111111111111";
const courseId = "22222222-2222-4222-8222-222222222222";
const itemId = "33333333-3333-4333-8333-333333333333";
const requestClient = { kind: "test-client" };

function authenticated(req, _res, next) {
  req.auth = { userId, token: "token", claims: { sub: userId } };
  req.supabase = requestClient;
  next();
}

function silentLogger() {
  return {};
}

async function withServer(app, callback) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function json(response) {
  return response.json();
}

test("health is public and reports the Supabase runtime", async () => {
  let authCalls = 0;
  const app = createApp({
    authenticate(_req, res) {
      authCalls += 1;
      res.status(401).json({ error: "Authentication required", code: "AUTH_REQUIRED" });
    },
    repository: {},
    env: {},
    logger: silentLogger(),
  });

  await withServer(app, async base => {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await json(response), {
      ok: true,
      ai_parser: "fallback_only",
      auth: "supabase",
      persistence: "supabase",
    });
  });
  assert.equal(authCalls, 0);
});

test("every application API except health is behind authentication", async () => {
  const app = createApp({
    authenticate(_req, res) {
      res.status(401).json({ error: "Authentication required", code: "AUTH_REQUIRED" });
    },
    repository: {},
    env: {},
    logger: silentLogger(),
  });
  const cases = [
    ["GET", "/api/courses"],
    ["POST", "/api/parse/text"],
    ["POST", "/api/parse/pdf"],
    ["POST", "/api/courses/import"],
    ["DELETE", `/api/courses/${courseId}`],
    ["POST", "/api/items"],
    ["PATCH", `/api/items/${itemId}`],
    ["PATCH", `/api/items/${itemId}/complete`],
    ["DELETE", `/api/items/${itemId}`],
    ["DELETE", "/api/account/data"],
    ["GET", "/api/not-a-route"],
  ];

  await withServer(app, async base => {
    for (const [method, pathname] of cases) {
      const hasBody = method === "POST" || method === "PATCH";
      const response = await fetch(`${base}${pathname}`, {
        method,
        ...(hasBody ? {
          headers: { "Content-Type": "application/json" },
          body: "{}",
        } : {}),
      });
      assert.equal(response.status, 401, `${method} ${pathname}`);
      assert.equal((await json(response)).code, "AUTH_REQUIRED");
    }
  });
});

test("reviewed import strips client-owned fields and returns a complete course", async () => {
  let captured = null;
  const course = {
    id: courseId,
    name: "CS 3450",
    parse_info: { engine: "groq" },
    items: [{ id: itemId, course_id: courseId, title: "Homework 1" }],
  };
  const repository = {
    async importReviewedCourse(client, ownerId, input) {
      captured = { client, ownerId, input };
      return { created: true, replaced: false, course };
    },
  };
  const app = createApp({
    authenticate: authenticated,
    repository,
    env: {},
    logger: silentLogger(),
  });

  await withServer(app, async base => {
    const response = await fetch(`${base}/api/courses/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseName: "  CS 3450 ",
        items: [{
          id: "client-id",
          user_id: "spoofed",
          title: " Homework 1 ",
          due_date: "2026-09-08",
          item_type: "Homework",
          weight: "4",
          estimated_effort_hours: "2",
          completed: true,
        }],
        parseInfo: {
          engine: "groq",
          input_type: "pdf",
          item_count: 1,
          raw_text: "must not persist",
          nested: { syllabus_text: "must not persist" },
        },
        replace: "true",
      }),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await json(response), course);
  });

  assert.equal(captured.client, requestClient);
  assert.equal(captured.ownerId, userId);
  assert.equal(captured.input.courseName, "CS 3450");
  assert.equal(captured.input.replace, false);
  assert.deepEqual(captured.input.items, [{
    title: "Homework 1",
    due_date: "2026-09-08",
    item_type: "Homework",
    weight: 4,
    estimated_effort_hours: 2,
  }]);
  assert.equal(Object.hasOwn(captured.input.parseInfo, "raw_text"), false);
  assert.equal(Object.hasOwn(captured.input.parseInfo, "nested"), false);
});

test("course conflicts retain the frontend's 409 contract", async () => {
  const app = createApp({
    authenticate: authenticated,
    repository: {
      async importReviewedCourse() {
        throw new RepositoryError("Course already exists", {
          status: 409,
          code: "COURSE_EXISTS",
        });
      },
    },
    env: {},
    logger: silentLogger(),
  });

  await withServer(app, async base => {
    const response = await fetch(`${base}/api/courses/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseName: "CS 3450",
        items: [{
          title: "Homework 1",
          due_date: "2026-09-08",
          item_type: "Homework",
          weight: 4,
          estimated_effort_hours: 2,
        }],
        replace: false,
      }),
    });
    assert.equal(response.status, 409);
    assert.equal((await json(response)).code, "COURSE_EXISTS");
  });
});

test("UUID item/course mutations and delete-my-data use verified ownership", async () => {
  const calls = [];
  const item = {
    id: itemId,
    course_id: courseId,
    title: "Quiz 1",
    due_date: "2026-09-08",
    item_type: "Quiz",
    weight: 0,
    estimated_effort_hours: 1,
    completed: false,
  };
  const repository = {
    async createItem(...args) { calls.push(["create", ...args]); return item; },
    async deleteCourse(...args) { calls.push(["delete-course", ...args]); return true; },
    async deleteOwnData(...args) { calls.push(["delete-data", ...args]); return true; },
  };
  const app = createApp({
    authenticate: authenticated,
    repository,
    env: {},
    logger: silentLogger(),
  });

  await withServer(app, async base => {
    const createResponse = await fetch(`${base}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        course_id: courseId,
        title: "Quiz 1",
        due_date: "2026-09-08",
        item_type: "Quiz",
        weight: 0,
        estimated_effort_hours: 1,
      }),
    });
    assert.equal(createResponse.status, 201);

    const deleteCourseResponse = await fetch(`${base}/api/courses/${courseId}`, {
      method: "DELETE",
    });
    assert.equal(deleteCourseResponse.status, 200);

    const deleteDataResponse = await fetch(`${base}/api/account/data`, {
      method: "DELETE",
    });
    assert.equal(deleteDataResponse.status, 200);
  });

  assert.deepEqual(calls.map(call => [call[0], call[2]]), [
    ["create", userId],
    ["delete-course", userId],
    ["delete-data", userId],
  ]);
  assert.equal(calls[0][1], requestClient);
  assert.equal(calls[0][3].course_id, courseId);
  assert.equal(calls[1][3], courseId);
});

test("invalid UUIDs and manual task values are rejected before persistence", async () => {
  let repositoryCalls = 0;
  const repository = {
    async deleteCourse() { repositoryCalls += 1; return true; },
    async createItem() { repositoryCalls += 1; return {}; },
  };
  const app = createApp({
    authenticate: authenticated,
    repository,
    env: {},
    logger: silentLogger(),
  });

  await withServer(app, async base => {
    const invalidCourse = await fetch(`${base}/api/courses/not-a-uuid`, { method: "DELETE" });
    assert.equal(invalidCourse.status, 400);

    const invalidItem = await fetch(`${base}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        course_id: courseId,
        title: " ",
        due_date: "2026-02-30",
        item_type: "Reading",
        weight: 101,
        estimated_effort_hours: 0,
      }),
    });
    assert.equal(invalidItem.status, 400);
    assert.equal((await json(invalidItem)).code, "VALIDATION_ERROR");
  });
  assert.equal(repositoryCalls, 0);
});
