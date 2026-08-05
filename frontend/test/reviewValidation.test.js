import assert from "node:assert/strict";
import test from "node:test";

import { validateReviewDraft } from "../src/reviewValidation.js";

const item = {
  title: "Homework 1",
  item_type: "Homework",
  due_date: "2026-09-08",
  weight: 4,
  estimated_effort_hours: 2,
};

test("review draft validation accepts valid edits", () => {
  assert.deepEqual(validateReviewDraft("CS 3450", [item]), []);
});

test("review draft validation catches impossible dates and duplicate tasks", () => {
  const issues = validateReviewDraft("CS 3450", [
    { ...item, due_date: "2026-02-30" },
    { ...item },
    { ...item },
  ]);
  assert.ok(issues.some(issue => issue.path === "items[0].due_date"));
  assert.ok(issues.some(issue => issue.message.includes("duplicate")));
});
