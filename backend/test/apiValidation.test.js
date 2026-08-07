import assert from "node:assert/strict";
import test from "node:test";

import {
  isUuid,
  normalizeItemPatch,
  normalizeNewItem,
  reviewedPrecisionIssues,
  sanitizeParseInfo,
  sanitizeReviewedItems,
} from "../src/apiValidation.js";

const courseId = "11111111-1111-4111-8111-111111111111";

test("UUID validation accepts canonical database IDs", () => {
  assert.equal(isUuid(courseId), true);
  assert.equal(isUuid("CS 3450"), false);
});

test("new-item validation preserves zero weight and normalizes approved fields", () => {
  const result = normalizeNewItem({
    course_id: courseId,
    title: "  Quiz 1  ",
    due_date: "2026-09-08",
    item_type: "Quiz",
    weight: 0,
    estimated_effort_hours: "1.5",
  });

  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.value, {
    course_id: courseId,
    title: "Quiz 1",
    due_date: "2026-09-08",
    item_type: "Quiz",
    weight: 0,
    estimated_effort_hours: 1.5,
  });
});

test("new-item validation rejects invalid and server-owned values", () => {
  const result = normalizeNewItem({
    course_id: "not-a-uuid",
    user_id: courseId,
    title: " ",
    due_date: "2026-02-30",
    item_type: "Reading",
    weight: 100.001,
    estimated_effort_hours: 0,
    completed: true,
  });

  for (const path of [
    "course_id",
    "user_id",
    "title",
    "due_date",
    "item_type",
    "weight",
    "estimated_effort_hours",
    "completed",
  ]) {
    assert.ok(result.issues.some(issue => issue.path === path), `missing ${path} issue`);
  }
});

test("item patch validation rejects empty, ownership, and non-boolean updates", () => {
  assert.ok(normalizeItemPatch({}).issues.some(issue => issue.path === "item"));

  const invalid = normalizeItemPatch({ course_id: courseId, completed: "false" });
  assert.ok(invalid.issues.some(issue => issue.path === "course_id"));
  assert.ok(invalid.issues.some(issue => issue.path === "completed"));

  const valid = normalizeItemPatch({ title: "  Revised title ", completed: false, weight: "4" });
  assert.deepEqual(valid, {
    issues: [],
    value: { title: "Revised title", completed: false, weight: 4 },
  });
});

test("review sanitizers drop IDs, ownership, completion, raw content, and unknown metadata", () => {
  const items = sanitizeReviewedItems([{
    id: "client-id",
    user_id: "spoofed",
    title: "  Homework 1 ",
    due_date: "2026-09-08",
    item_type: "Homework",
    weight: "4",
    estimated_effort_hours: "2",
    completed: true,
    priority_score: 999,
  }]);
  assert.deepEqual(items, [{
    title: "Homework 1",
    due_date: "2026-09-08",
    item_type: "Homework",
    weight: 4,
    estimated_effort_hours: 2,
  }]);

  const metadata = sanitizeParseInfo({
    engine: "groq",
    input_type: "pdf",
    item_count: 1,
    pages: 2,
    character_count: 1200,
    filename: " syllabus.pdf ",
    request_id: "request-1",
    warning: "review this",
    raw_text: "secret",
    nested: { raw_text: "also secret" },
  }, 1);
  assert.deepEqual(metadata, {
    engine: "groq",
    input_type: "pdf",
    item_count: 1,
    reviewed: true,
    extracted_item_count: 1,
    pages: 2,
    character_count: 1200,
    filename: "syllabus.pdf",
    request_id: "request-1",
    warning: "review this",
  });
});

test("reviewed imports reject precision the database would otherwise round", () => {
  const issues = reviewedPrecisionIssues([{
    weight: 4.123,
    estimated_effort_hours: 2.555,
  }]);
  assert.deepEqual(issues.map(issue => issue.path), [
    "items[0].weight",
    "items[0].estimated_effort_hours",
  ]);
});
