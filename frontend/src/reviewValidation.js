export const REVIEW_ITEM_TYPES = ["Homework", "Quiz", "Exam", "Midterm", "Final", "Project", "Lab", "Paper", "Presentation", "Task"];

function validDateKey(value) {
  const match = String(value || "").match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1])
    && date.getMonth() === Number(match[2]) - 1
    && date.getDate() === Number(match[3]);
}

export function validateReviewDraft(courseName, items) {
  const issues = [];
  const name = String(courseName || "").trim();
  if (!name || name.length > 100) issues.push({ path: "courseName", message: "Enter a course name up to 100 characters." });
  if (!items.length) return [...issues, { path: "items", message: "Add at least one task." }];
  if (items.length > 250) issues.push({ path: "items", message: "Keep the import to 250 tasks or fewer." });

  const seen = new Set();
  items.forEach((item, index) => {
    const prefix = `items[${index}]`;
    const title = String(item.title || "").trim();
    if (!title || title.length > 120) issues.push({ path: `${prefix}.title`, message: "Enter a title up to 120 characters." });
    if (!REVIEW_ITEM_TYPES.includes(item.item_type)) issues.push({ path: `${prefix}.item_type`, message: "Choose a task type." });
    if (!validDateKey(item.due_date)) issues.push({ path: `${prefix}.due_date`, message: "Enter a valid date." });
    const weight = Number(item.weight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) issues.push({ path: `${prefix}.weight`, message: "Use a weight from 0 to 100." });
    const effort = Number(item.estimated_effort_hours);
    if (!Number.isFinite(effort) || effort < 0.5 || effort > 80) issues.push({ path: `${prefix}.estimated_effort_hours`, message: "Use 0.5 to 80 hours." });

    if (title && validDateKey(item.due_date)) {
      const key = `${title.toLowerCase()}|${item.due_date}`;
      if (seen.has(key)) issues.push({ path: prefix, message: "Remove this duplicate task." });
      seen.add(key);
    }
  });
  return issues;
}
