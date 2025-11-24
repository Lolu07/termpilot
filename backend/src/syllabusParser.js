import { priorityScore } from "./priority.js";
import { uid } from "./util.js";

/**
 * Heuristic syllabus parser:
 * Looks for lines that contain a date and an assignment keyword.
 * Supported date formats:
 *  - 2025-03-18
 *  - 03/18/2025 or 3/18/25
 *  - Mar 18, 2025 (and similar)
 * You can tweak keywords below.
 */
const KEYWORDS = [
  "homework", "hw", "assignment", "quiz",
  "exam", "midterm", "final", "project",
  "lab", "presentation", "paper"
];

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

function tryParseDate(raw) {
  raw = raw.trim();

  // ISO yyyy-mm-dd
  let m = raw.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  // mm/dd/yyyy or m/d/yy
  m = raw.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(m[1]) - 1, Number(m[2]));
  }

  // Month name: "Mar 18, 2025"
  m = raw.match(/\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    if (!month) return null;
    return new Date(Number(m[3]), month - 1, Number(m[2]));
  }

  return null;
}

function inferType(line) {
  const lower = line.toLowerCase();
  if (lower.includes("final")) return "Final";
  if (lower.includes("midterm")) return "Midterm";
  if (lower.includes("exam")) return "Exam";
  if (lower.includes("quiz")) return "Quiz";
  if (lower.includes("project")) return "Project";
  if (lower.includes("lab")) return "Lab";
  if (lower.includes("paper") || lower.includes("essay")) return "Paper";
  if (lower.includes("homework") || lower.includes("hw") || lower.includes("assignment")) return "Homework";
  return "Task";
}

// naive effort estimate based on type
function estimateEffortHours(type) {
  switch (type) {
    case "Quiz": return 1;
    case "Homework": return 2;
    case "Lab": return 2;
    case "Project": return 6;
    case "Paper": return 5;
    case "Exam":
    case "Midterm":
    case "Final": return 4;
    default: return 1.5;
  }
}

export function parseSyllabusText(text, courseName) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!KEYWORDS.some(k => lower.includes(k))) continue;

    // Find a date-like substring
    const dateMatch = line.match(/\b(20\d{2}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+20\d{2})\b/);
    if (!dateMatch) continue;

    const due = tryParseDate(dateMatch[0]);
    if (!due) continue;

    const type = inferType(line);
    const est = estimateEffortHours(type);

    const title = line
      .replace(dateMatch[0], "")
      .replace(/[-–—:]+/g, " ")
      .trim()
      .slice(0, 120);

    const item = {
      id: uid(),
      course: courseName,
      item_type: type,
      title: title || `${type} item`,
      due_date: due.toISOString().slice(0,10),
      estimated_effort_hours: est,
      weight: 10, // default; user can edit later
      completed: false
    };
    item.priority_score = priorityScore(item);
    items.push(item);
  }

  // Sort by due date
  items.sort((a,b) => a.due_date.localeCompare(b.due_date));
  return items;
}