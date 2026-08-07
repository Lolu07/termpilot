import assert from "node:assert/strict";
import test from "node:test";

import {
  createSupabaseRepository,
  RepositoryError,
  serializeCourse,
} from "../src/repository.js";

const userId = "11111111-1111-4111-8111-111111111111";
const courseId = "22222222-2222-4222-8222-222222222222";
const itemId = "33333333-3333-4333-8333-333333333333";

function courseRow() {
  return {
    id: courseId,
    name: "CS 3450",
    parse_info: { engine: "groq" },
    created_at: "2026-08-05T12:00:00Z",
    updated_at: "2026-08-05T12:00:00Z",
    items: [
      {
        id: itemId,
        course_id: courseId,
        item_type: "Homework",
        title: "Later",
        due_date: "2026-09-20",
        estimated_effort_hours: "2.50",
        weight: "4.00",
        completed: false,
        created_at: "2026-08-05T12:00:00Z",
        updated_at: "2026-08-05T12:00:00Z",
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        course_id: courseId,
        item_type: "Quiz",
        title: "Earlier",
        due_date: "2026-09-10",
        estimated_effort_hours: 1,
        weight: 2,
        completed: true,
        created_at: "2026-08-05T12:00:00Z",
        updated_at: "2026-08-05T12:00:00Z",
      },
    ],
  };
}

test("course serialization normalizes numerics, sorts tasks, and recalculates priority", () => {
  const course = serializeCourse(courseRow(), () => 123);
  assert.equal(course.items[0].title, "Earlier");
  assert.equal(course.items[1].estimated_effort_hours, 2.5);
  assert.equal(course.items[1].weight, 4);
  assert.ok(course.items.every(item => item.priority_score === 123));
  assert.equal(Object.hasOwn(course, "user_id"), false);
});

test("listCourses always filters by the verified user ID", async () => {
  const filters = [];
  const builder = {
    select() { return this; },
    eq(column, value) { filters.push([column, value]); return this; },
    async order() { return { data: [courseRow()], error: null }; },
  };
  const repository = createSupabaseRepository({ priorityScoreFn: () => 1 });
  const courses = await repository.listCourses({ from: () => builder }, userId);

  assert.deepEqual(filters, [["user_id", userId]]);
  assert.equal(courses.length, 1);
});

test("reviewed import sends exact RPC arguments and refetches the complete course", async () => {
  const rpcCalls = [];
  const filters = [];
  const builder = {
    select() { return this; },
    eq(column, value) { filters.push([column, value]); return this; },
    async maybeSingle() { return { data: courseRow(), error: null }; },
  };
  const client = {
    async rpc(name, args) {
      rpcCalls.push([name, args]);
      return {
        data: {
          course_id: courseId,
          import_id: "55555555-5555-4555-8555-555555555555",
          created: true,
          replaced: false,
        },
        error: null,
      };
    },
    from(table) {
      assert.equal(table, "courses");
      return builder;
    },
  };
  const repository = createSupabaseRepository({ priorityScoreFn: () => 1 });
  const input = {
    courseName: "CS 3450",
    items: [{ title: "Homework 1" }],
    parseInfo: { engine: "groq" },
    replace: false,
  };

  const result = await repository.importReviewedCourse(client, userId, input);

  assert.deepEqual(rpcCalls, [["import_reviewed_course", {
    p_course_name: input.courseName,
    p_items: input.items,
    p_parse_info: input.parseInfo,
    p_replace_existing: false,
  }]]);
  assert.deepEqual(filters, [["id", courseId], ["user_id", userId]]);
  assert.equal(result.created, true);
  assert.equal(result.course.id, courseId);
  assert.equal(result.course.items.length, 2);
});

test("import distinguishes course replacement conflicts from other unique violations", async () => {
  const repository = createSupabaseRepository();
  const courseConflictClient = {
    async rpc() {
      return {
        data: null,
        error: {
          code: "23505",
          message: "A course with this name already exists.",
          details: "Set p_replace_existing to true only after explicit user confirmation.",
        },
      };
    },
  };
  await assert.rejects(
    repository.importReviewedCourse(courseConflictClient, userId, {
      courseName: "CS 3450", items: [], parseInfo: {}, replace: false,
    }),
    error => error instanceof RepositoryError && error.code === "COURSE_EXISTS" && error.status === 409,
  );

  const itemConflictClient = {
    async rpc() {
      return {
        data: null,
        error: {
          code: "23505",
          message: "duplicate key value violates unique constraint items_course_title_due_date_unique",
        },
      };
    },
  };
  await assert.rejects(
    repository.importReviewedCourse(itemConflictClient, userId, {
      courseName: "CS 3450", items: [], parseInfo: {}, replace: false,
    }),
    error => error instanceof RepositoryError && error.code === "DUPLICATE_RECORD",
  );
});

test("manual item creation derives ownership from verified claims", async () => {
  let inserted = null;
  let fromCalls = 0;
  const courseBuilder = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: { id: courseId }, error: null }; },
  };
  const itemBuilder = {
    insert(value) { inserted = value; return this; },
    select() { return this; },
    async single() {
      return {
        data: {
          ...inserted,
          id: itemId,
          created_at: "2026-08-05T12:00:00Z",
          updated_at: "2026-08-05T12:00:00Z",
        },
        error: null,
      };
    },
  };
  const client = {
    from() {
      fromCalls += 1;
      return fromCalls === 1 ? courseBuilder : itemBuilder;
    },
  };
  const repository = createSupabaseRepository({ priorityScoreFn: () => 1 });

  await repository.createItem(client, userId, {
    course_id: courseId,
    title: "Quiz 1",
    due_date: "2026-09-08",
    item_type: "Quiz",
    weight: 0,
    estimated_effort_hours: 1,
    user_id: "spoofed",
  });

  assert.equal(inserted.user_id, userId);
  assert.equal(inserted.course_id, courseId);
  assert.equal(inserted.completed, false);
});
