const REVIEW_ITEM_TYPES = new Set([
  "Homework", "Quiz", "Exam", "Midterm", "Final",
  "Project", "Lab", "Paper", "Presentation", "Task",
]);

function validDateKey(value) {
  const match = String(value || "").match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3]);
}

export function validateReviewedImport(courseName, items) {
  const issues = [];
  const name = String(courseName || "").trim();
  if (!name) issues.push({ path: "courseName", message: "Enter a course name." });
  if (name.length > 100) issues.push({ path: "courseName", message: "Course names must be 100 characters or fewer." });
  if (!Array.isArray(items) || items.length === 0) {
    issues.push({ path: "items", message: "Add at least one task." });
    return issues;
  }
  if (items.length > 250) issues.push({ path: "items", message: "A course can contain at most 250 tasks." });

  const seen = new Set();
  items.forEach((item, index) => {
    const prefix = `items[${index}]`;
    const title = String(item?.title || "").trim();
    if (!title) issues.push({ path: `${prefix}.title`, message: "Enter a task title." });
    if (title.length > 120) issues.push({ path: `${prefix}.title`, message: "Task titles must be 120 characters or fewer." });
    if (!REVIEW_ITEM_TYPES.has(item?.item_type)) issues.push({ path: `${prefix}.item_type`, message: "Choose a supported task type." });
    if (!validDateKey(item?.due_date)) issues.push({ path: `${prefix}.due_date`, message: "Enter a valid due date." });

    const weight = Number(item?.weight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      issues.push({ path: `${prefix}.weight`, message: "Weight must be between 0 and 100." });
    }
    const effort = Number(item?.estimated_effort_hours);
    if (!Number.isFinite(effort) || effort < 0.5 || effort > 80) {
      issues.push({ path: `${prefix}.estimated_effort_hours`, message: "Effort must be between 0.5 and 80 hours." });
    }

    if (title && validDateKey(item?.due_date)) {
      const key = `${title.toLowerCase()}|${item.due_date}`;
      if (seen.has(key)) issues.push({ path: prefix, message: "Remove this duplicate task." });
      seen.add(key);
    }
  });
  return issues;
}

// Reviewed rows must not pass through parser cleanup again. This preserves the
// exact values the user approved while regenerating every server-owned field.
export function materializeReviewedItems(items, courseName) {
  return items
    .map(item => {
      const reviewed = {
        id: uid(),
        course: courseName,
        item_type: item.item_type,
        title: String(item.title).trim(),
        due_date: item.due_date,
        estimated_effort_hours: Number(item.estimated_effort_hours),
        weight: Number(item.weight),
        completed: false,
      };
      reviewed.priority_score = priorityScore(reviewed);
      return reviewed;
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export function isReplacementConfirmed(value) {
  return value === true;
}
import { priorityScore } from "./priority.js";
import { uid } from "./util.js";
