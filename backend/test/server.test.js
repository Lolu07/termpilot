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

function anonymousAuthenticated(req, _res, next) {
  req.auth = {
    userId,
    token: "demo-token",
    claims: { sub: userId, role: "authenticated", is_anonymous: true },
  };
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
    ["POST", "/api/demo/bootstrap"],
    ["POST", "/api/demo/reset"],
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

test("only verified anonymous sessions can create or reset demo data", async () => {
  let repositoryCalls = 0;
  const app = createApp({
    authenticate: authenticated,
    repository: {
      async listCourses() { repositoryCalls += 1; return []; },
      async deleteOwnData() { repositoryCalls += 1; },
      async importReviewedCourse() { repositoryCalls += 1; },
    },
    env: {},
    logger: silentLogger(),
  });

  await withServer(app, async base => {
    for (const pathname of ["/api/demo/bootstrap", "/api/demo/reset"]) {
      const response = await fetch(`${base}${pathname}`, { method: "POST" });
      assert.equal(response.status, 403);
      assert.equal((await json(response)).code, "DEMO_ONLY");
    }
  });
  assert.equal(repositoryCalls, 0);
});

test("demo bootstrap seeds an isolated showcase and is idempotent", async () => {
  const calls = [];
  let courses = [];
  const repository = {
    async listCourses(client, ownerId) {
      calls.push(["list", client, ownerId]);
      return courses;
    },
    async importReviewedCourse(client, ownerId, input) {
      calls.push(["import", client, ownerId, input]);
      const course = {
        id: `${courses.length + 2}`.repeat(8).slice(0, 8) + "-2222-4222-8222-222222222222",
        name: input.courseName,
        parse_info: input.parseInfo,
        items: input.items,
      };
      courses = [...courses, course];
      return { course, created: true };
    },
  };
  const app = createApp({
    authenticate: anonymousAuthenticated,
    repository,
    env: {},
    logger: silentLogger(),
  });

  await withServer(app, async base => {
    const first = await fetch(`${base}/api/demo/bootstrap`, { method: "POST" });
    assert.equal(first.status, 201);
    assert.equal(first.headers.get("cache-control"), "no-store");
    const firstPayload = await json(first);
    assert.equal(firstPayload.seeded, true);
    assert.equal(firstPayload.courses.length, 2);
    assert.equal(firstPayload.courses.flatMap(course => course.items).length, 9);

    const second = await fetch(`${base}/api/demo/bootstrap`, { method: "POST" });
    assert.equal(second.status, 200);
    assert.equal((await json(second)).seeded, false);
  });

  const imports = calls.filter(call => call[0] === "import");
  assert.equal(imports.length, 2);
  assert.ok(imports.every(call => call[1] === requestClient && call[2] === userId));
  assert.ok(imports.every(call => call[3].parseInfo.demo_seed === true));
});

test("demo reset deletes and restores only the verified demo user's workspace", async () => {
  const calls = [];
  let courses = [{ id: courseId, name: "Changed demo course", items: [] }];
  const repository = {
    async deleteOwnData(client, ownerId) {
      calls.push(["delete", client, ownerId]);
      courses = [];
    },
    async importReviewedCourse(client, ownerId, input) {
      calls.push(["import", client, ownerId, input.courseName]);
      const course = { id: crypto.randomUUID(), name: input.courseName, items: input.items };
      courses.push(course);
      return { course, created: true };
    },
    async listCourses(client, ownerId) {
      calls.push(["list", client, ownerId]);
      return courses;
    },
  };
  const app = createApp({
    authenticate: anonymousAuthenticated,
    repository,
    env: {},
    logger: silentLogger(),
  });

  await withServer(app, async base => {
    const response = await fetch(`${base}/api/demo/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: "99999999-9999-4999-8999-999999999999" }),
    });
    assert.equal(response.status, 200);
    const payload = await json(response);
    assert.equal(payload.reset, true);
    assert.equal(payload.courses.length, 2);
  });

  assert.equal(calls[0][0], "delete");
  assert.ok(calls.every(call => call[1] === requestClient && call[2] === userId));
});

test("anonymous demos receive a tighter parser limit without losing parser access", async () => {
  let parseCalls = 0;
  const app = createApp({
    authenticate: anonymousAuthenticated,
    repository: {},
    parseSyllabusFn: async () => {
      parseCalls += 1;
      return {
        items: [{
          title: "Demo task",
          due_date: "2026-09-08",
          item_type: "Task",
          weight: 0,
          estimated_effort_hours: 1,
        }],
        meta: { engine: "fallback", item_count: 1 },
      };
    },
    env: {},
    logger: silentLogger(),
  });

  await withServer(app, async base => {
    for (let index = 0; index < 5; index += 1) {
      const response = await fetch(`${base}/api/parse/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseName: "Demo", text: `Task ${index} due 2026-09-08` }),
      });
      assert.equal(response.status, 200);
    }
    const limited = await fetch(`${base}/api/parse/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseName: "Demo", text: "Another task due 2026-09-08" }),
    });
    assert.equal(limited.status, 429);
    assert.equal((await json(limited)).code, "RATE_LIMITED");
  });
  assert.equal(parseCalls, 5);
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
