import assert from "node:assert/strict";
import test from "node:test";

import { daysUntilDue, priorityLabel, priorityScore } from "../src/priority.js";

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

test("due-date windows outrank weight and effort from later windows", () => {
  const now = new Date(2026, 7, 5, 12);
  const nearbyAssignment = {
    due_date: "2026-08-11",
    weight: 0,
    estimated_effort_hours: 1,
  };
  const distantExam = {
    due_date: "2026-09-08",
    weight: 100,
    estimated_effort_hours: 80,
  };

  assert.ok(
    priorityScore(nearbyAssignment, now) > priorityScore(distantExam, now),
    "work due within seven days must outrank work due more than thirty days away",
  );
});

test("priority windows and labels remain meaningful", () => {
  const now = new Date(2026, 7, 5, 12);
  const scoreFor = due_date => priorityScore({ due_date, weight: 0, estimated_effort_hours: 0 }, now);

  assert.equal(priorityLabel(scoreFor("2026-08-04")), "Critical");
  assert.equal(priorityLabel(scoreFor("2026-08-05")), "Critical");
  assert.equal(priorityLabel(scoreFor("2026-08-07")), "High");
  assert.equal(priorityLabel(scoreFor("2026-08-11")), "Soon");
  assert.equal(priorityLabel(scoreFor("2026-08-16")), "Upcoming");
  assert.equal(priorityLabel(scoreFor("2026-10-05")), "Planned");
});
