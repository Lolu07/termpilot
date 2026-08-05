import assert from "node:assert/strict";
import test from "node:test";

import { isReplacementConfirmed, materializeReviewedItems, validateReviewedImport } from "../src/reviewValidation.js";

const validItem = {
  title: "Homework 1",
  item_type: "Homework",
  due_date: "2026-09-08",
  weight: 4,
  estimated_effort_hours: 2,
};

test("review validation accepts a valid reviewed import", () => {
  assert.deepEqual(validateReviewedImport("CS 3450", [validItem]), []);
});

test("review validation rejects invalid dates, limits, types, and duplicates", () => {
  const issues = validateReviewedImport("CS 3450", [
    { ...validItem, due_date: "2026-02-30", weight: 101, item_type: "Reading" },
    { ...validItem },
    { ...validItem },
  ]);
  assert.ok(issues.some(issue => issue.path === "items[0].due_date"));
  assert.ok(issues.some(issue => issue.path === "items[0].weight"));
  assert.ok(issues.some(issue => issue.path === "items[0].item_type"));
  assert.ok(issues.some(issue => issue.message.includes("duplicate")));
});

test("review validation requires a course and at least one task", () => {
  const issues = validateReviewedImport("", []);
  assert.ok(issues.some(issue => issue.path === "courseName"));
  assert.ok(issues.some(issue => issue.path === "items"));
});

test("review materialization preserves approved rows and replaces server-owned fields", () => {
  const rows = [
    {
      id: "client-id",
      course: "Wrong course",
      title: "Homework 1",
      due_date: "2026-09-08",
      item_type: "Homework",
      weight: "4",
      estimated_effort_hours: "2",
      completed: true,
      priority_score: -1,
    },
    {
      id: "another-client-id",
      title: "Homework 1 due",
      due_date: "2026-09-08",
      item_type: "Homework",
      weight: 4,
      estimated_effort_hours: 2,
      completed: true,
    },
  ];

  assert.equal(validateReviewedImport("CS 3450", rows).length, 0);
  const materialized = materializeReviewedItems(rows, "CS 3450");
  assert.equal(materialized.length, 2);
  assert.deepEqual(materialized.map(item => item.title), ["Homework 1", "Homework 1 due"]);
  assert.ok(materialized.every(item => item.course === "CS 3450" && item.completed === false));
  assert.ok(materialized.every(item => item.id !== "client-id" && item.id !== "another-client-id"));
  assert.ok(materialized.every(item => Number.isFinite(item.priority_score)));
});

test("course replacement requires the literal boolean true", () => {
  assert.equal(isReplacementConfirmed(true), true);
  assert.equal(isReplacementConfirmed(false), false);
  assert.equal(isReplacementConfirmed("true"), false);
  assert.equal(isReplacementConfirmed("false"), false);
  assert.equal(isReplacementConfirmed(1), false);
});
