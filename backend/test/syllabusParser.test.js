import assert from "node:assert/strict";
import test from "node:test";

import { buildItems, inferType, parseWithFallback } from "../src/syllabusParser.js";

test("fallback parses dates, explicit weights, clean titles, and item types", () => {
  const text = [
    "Homework 1 - Requirements Document due 2026-09-08 (4%)",
    "Lab Report 1 - Git Workflow due September 12, 2026 (2.5%)",
    "Final Presentation due 10/03/2026 (5%)",
  ].join("\n");

  const items = parseWithFallback(text, "CS 3450");
  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map(item => [item.title, item.item_type, item.due_date, item.weight, item.estimated_effort_hours]),
    [
      ["Homework 1 - Requirements Document", "Homework", "2026-09-08", 4, 2],
      ["Lab Report 1 - Git Workflow", "Lab", "2026-09-12", 2.5, 2],
      ["Final Presentation", "Presentation", "2026-10-03", 5, 3],
    ],
  );
});

test("fallback parses coordinate-separated PDF table rows without leaking columns into titles", () => {
  const text = [
    "Homework 1 - Requirements Document | Homework | September 8, 2026 | 40",
    "Project Milestone 4 - Final Presentation | Project | December 9, 2026 | 75",
    "Final Exam | Exam | December 16, 2026 | 200",
  ].join("\n");

  const items = parseWithFallback(text, "CS 3450");
  assert.deepEqual(
    items.map(item => [item.title, item.item_type, item.due_date]),
    [
      ["Homework 1 - Requirements Document", "Homework", "2026-09-08"],
      ["Project Milestone 4 - Final Presentation", "Project", "2026-12-09"],
      ["Final Exam", "Final", "2026-12-16"],
    ],
  );
});

test("buildItems validates dates, clamps values, preserves zero weight, and deduplicates", () => {
  const items = buildItems([
    { title: "Quiz 1", due_date: "2026-02-30", item_type: "Quiz", weight: 2, estimated_effort_hours: 1 },
    { title: "Capstone", due_date: "2026-10-01", item_type: "Unknown", weight: 0, estimated_effort_hours: 200 },
    { title: "Capstone", due_date: "2026-10-01", item_type: "Project", weight: 30, estimated_effort_hours: 6 },
  ], "CS 4000");

  assert.equal(items.length, 1);
  assert.equal(items[0].weight, 0);
  assert.equal(items[0].estimated_effort_hours, 80);
  assert.equal(items[0].item_type, "Task");
});

test("type inference distinguishes final presentations, projects, and final exams", () => {
  assert.equal(inferType("Final Presentation"), "Presentation");
  assert.equal(inferType("Final Project"), "Project");
  assert.equal(inferType("Final Exam"), "Final");
});

test("fallback does not treat the word syllabus as a lab assignment", () => {
  const items = parseWithFallback("Syllabus updated September 8, 2026", "TEST 101");
  assert.equal(items.length, 0);
});

test("fallback does not copy category percentages onto individual tasks", () => {
  const text = [
    "Grading: Homework (6 assignments) — 30%; Quizzes — 10%; Exams — 35%",
    "Homework 1 due 2026-08-11",
    "Homework 2 due 2026-08-25",
    "Exam 1 due 2026-09-08",
  ].join("\n");

  const items = parseWithFallback(text, "CS 201");
  assert.deepEqual(items.map(item => item.weight), [0, 0, 0]);
});
