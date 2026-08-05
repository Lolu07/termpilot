import assert from "node:assert/strict";
import test from "node:test";

import { daysUntilDue, priorityScore } from "../src/priority.js";

test("daysUntilDue treats YYYY-MM-DD as a local calendar date", () => {
  const now = new Date(2026, 8, 8, 23, 30);
  assert.equal(daysUntilDue("2026-09-08", now), 0);
  assert.equal(daysUntilDue("2026-09-07", now), -1);
  assert.equal(daysUntilDue("2026-09-10", now), 2);
});

test("overdue work scores higher than otherwise identical future work", () => {
  const base = { weight: 10, estimated_effort_hours: 2 };
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const key = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  assert.ok(priorityScore({ ...base, due_date: key(yesterday) }) > priorityScore({ ...base, due_date: key(nextWeek) }));
});
