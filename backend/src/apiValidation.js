const ITEM_TYPES = new Set([
  "Homework", "Quiz", "Exam", "Midterm", "Final",
  "Project", "Lab", "Paper", "Presentation", "Task",
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERVER_OWNED_ITEM_FIELDS = new Set([
  "id", "user_id", "priority_score", "created_at", "updated_at",
]);

export function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isValidDateKey(value) {
  const match = typeof value === "string"
    ? value.match(/^(20\d{2})-(\d{2})-(\d{2})$/)
    : null;
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3]);
}

function hasAtMostTwoDecimalPlaces(value) {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
}

function normalizeNumber(value, { path, min, max }, issues) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    issues.push({ path, message: `${path} must be between ${min} and ${max}.` });
    return null;
  }
  if (!hasAtMostTwoDecimalPlaces(number)) {
    issues.push({ path, message: `${path} can have at most two decimal places.` });
    return null;
  }
  return number;
}

function rejectServerOwnedFields(input, issues, { allowCourseId = false } = {}) {
  for (const field of SERVER_OWNED_ITEM_FIELDS) {
    if (Object.hasOwn(input, field)) {
      issues.push({ path: field, message: `${field} is managed by the server.` });
    }
  }
  if (!allowCourseId && Object.hasOwn(input, "course_id")) {
    issues.push({ path: "course_id", message: "course_id cannot be changed." });
  }
}

export function normalizeNewItem(input = {}) {
  const issues = [];
  rejectServerOwnedFields(input, issues, { allowCourseId: true });

  if (!isUuid(input.course_id)) {
    issues.push({ path: "course_id", message: "Choose a valid course." });
  }

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 120) {
    issues.push({ path: "title", message: "Enter a task title up to 120 characters." });
  }

  const dueDate = input.due_date;
  if (!isValidDateKey(dueDate)) {
    issues.push({ path: "due_date", message: "Enter a valid date in YYYY-MM-DD format." });
  }

  const itemType = input.item_type ?? "Task";
  if (!ITEM_TYPES.has(itemType)) {
    issues.push({ path: "item_type", message: "Choose a supported task type." });
  }

  const weight = normalizeNumber(input.weight ?? 0, {
    path: "weight", min: 0, max: 100,
  }, issues);
  const effort = normalizeNumber(input.estimated_effort_hours ?? 2, {
    path: "estimated_effort_hours", min: 0.5, max: 80,
  }, issues);

  if (Object.hasOwn(input, "completed")) {
    issues.push({ path: "completed", message: "New tasks always start incomplete." });
  }

  return {
    issues,
    value: {
      course_id: input.course_id,
      title,
      due_date: dueDate,
      item_type: itemType,
      weight,
      estimated_effort_hours: effort,
    },
  };
}

export function normalizeItemPatch(input = {}) {
  const issues = [];
  const value = {};
  rejectServerOwnedFields(input, issues);

  if (Object.hasOwn(input, "title")) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title || title.length > 120) {
      issues.push({ path: "title", message: "Enter a task title up to 120 characters." });
    } else {
      value.title = title;
    }
  }

  if (Object.hasOwn(input, "due_date")) {
    if (!isValidDateKey(input.due_date)) {
      issues.push({ path: "due_date", message: "Enter a valid date in YYYY-MM-DD format." });
    } else {
      value.due_date = input.due_date;
    }
  }

  if (Object.hasOwn(input, "item_type")) {
    if (!ITEM_TYPES.has(input.item_type)) {
      issues.push({ path: "item_type", message: "Choose a supported task type." });
    } else {
      value.item_type = input.item_type;
    }
  }

  if (Object.hasOwn(input, "weight")) {
    const weight = normalizeNumber(input.weight, { path: "weight", min: 0, max: 100 }, issues);
    if (weight !== null) value.weight = weight;
  }

  if (Object.hasOwn(input, "estimated_effort_hours")) {
    const effort = normalizeNumber(input.estimated_effort_hours, {
      path: "estimated_effort_hours", min: 0.5, max: 80,
    }, issues);
    if (effort !== null) value.estimated_effort_hours = effort;
  }

  if (Object.hasOwn(input, "completed")) {
    if (typeof input.completed !== "boolean") {
      issues.push({ path: "completed", message: "completed must be true or false." });
    } else {
      value.completed = input.completed;
    }
  }

  if (Object.keys(value).length === 0 && issues.length === 0) {
    issues.push({ path: "item", message: "Provide at least one editable task field." });
  }

  return { issues, value };
}

export function sanitizeReviewedItems(items) {
  return items.map(item => ({
    title: String(item.title).trim(),
    due_date: item.due_date,
    item_type: item.item_type,
    weight: Number(item.weight),
    estimated_effort_hours: Number(item.estimated_effort_hours),
  }));
}

export function reviewedPrecisionIssues(items) {
  if (!Array.isArray(items)) return [];
  const issues = [];
  items.forEach((item, index) => {
    const weight = Number(item?.weight);
    if (Number.isFinite(weight) && !hasAtMostTwoDecimalPlaces(weight)) {
      issues.push({
        path: `items[${index}].weight`,
        message: "Weight can have at most two decimal places.",
      });
    }
    const effort = Number(item?.estimated_effort_hours);
    if (Number.isFinite(effort) && !hasAtMostTwoDecimalPlaces(effort)) {
      issues.push({
        path: `items[${index}].estimated_effort_hours`,
        message: "Effort can have at most two decimal places.",
      });
    }
  });
  return issues;
}

export function sanitizeParseInfo(parseInfo, reviewedItemCount) {
  const source = parseInfo && typeof parseInfo === "object" && !Array.isArray(parseInfo)
    ? parseInfo
    : {};
  const result = {
    engine: source.engine === "groq" ? "groq" : "fallback",
    input_type: source.input_type === "pdf" ? "pdf" : "text",
    item_count: reviewedItemCount,
    reviewed: true,
  };

  const extractedCount = Number(source.item_count);
  if (Number.isInteger(extractedCount) && extractedCount >= 0 && extractedCount <= 250) {
    result.extracted_item_count = extractedCount;
  }

  const pages = Number(source.pages);
  if (Number.isInteger(pages) && pages >= 1 && pages <= 75) result.pages = pages;

  const characterCount = Number(source.character_count);
  if (Number.isInteger(characterCount) && characterCount >= 0 && characterCount <= 150_000) {
    result.character_count = characterCount;
  }

  if (typeof source.filename === "string" && source.filename.trim()) {
    result.filename = source.filename.trim().slice(0, 160);
  }
  if (typeof source.request_id === "string" && source.request_id.trim()) {
    result.request_id = source.request_id.trim().slice(0, 64);
  }
  if (typeof source.warning === "string" && source.warning.trim()) {
    result.warning = source.warning.trim().slice(0, 500);
  }

  return result;
}
