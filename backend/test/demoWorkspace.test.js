import assert from "node:assert/strict";
import test from "node:test";

import { buildDemoCourses } from "../src/demoWorkspace.js";

const VALID_ITEM_TYPES = new Set([
  "Homework", "Quiz", "Exam", "Midterm", "Final",
  "Project", "Lab", "Paper", "Presentation", "Task",
]);

test("buildDemoCourses returns two import-ready courses with nine current tasks", () => {
  const courses = buildDemoCourses({ now: new Date("2026-08-07T19:30:00Z") });

  assert.equal(courses.length, 2);
  assert.equal(new Set(courses.map(course => course.courseName)).size, 2);
  assert.equal(courses.flatMap(course => course.items).length, 9);

  for (const demoCourse of courses) {
    assert.equal(demoCourse.replace, false);
    assert.deepEqual(demoCourse.parseInfo, {
      engine: "fallback",
      input_type: "text",
      item_count: demoCourse.items.length,
      reviewed: true,
      demo_seed: true,
    });

    for (const item of demoCourse.items) {
      assert.deepEqual(Object.keys(item).sort(), [
        "due_date",
        "estimated_effort_hours",
        "item_type",
        "title",
        "weight",
      ]);
      assert.match(item.due_date, /^20\d{2}-\d{2}-\d{2}$/);
      assert.ok(item.due_date > "2026-08-07");
      assert.ok(VALID_ITEM_TYPES.has(item.item_type));
      assert.ok(item.title.length > 0 && item.title.length <= 120);
      assert.ok(item.weight >= 0 && item.weight <= 100);
      assert.ok(item.estimated_effort_hours >= 0.5 && item.estimated_effort_hours <= 80);
    }
  }
});

test("buildDemoCourses derives stable due dates from the reference UTC day", () => {
  const first = buildDemoCourses({ now: "2026-12-30T23:59:59-05:00" });
  const second = buildDemoCourses({ now: "2026-12-31T04:59:59Z" });

  assert.deepEqual(first, second);
  assert.equal(first[0].items[0].due_date, "2027-01-03");
  assert.equal(first[1].items.at(-1).due_date, "2027-02-18");
});

test("buildDemoCourses rejects an invalid reference date", () => {
  assert.throws(
    () => buildDemoCourses({ now: "not-a-date" }),
    error => error instanceof TypeError && /valid date/.test(error.message),
  );
});
