import Groq from "groq-sdk";
import { priorityScore } from "./priority.js";
import { uid } from "./util.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "" });

export async function parseSyllabusText(text, courseName) {
  const today = new Date().toISOString().slice(0, 10);

  const prompt = `You are an academic syllabus parser. Extract every graded item from the syllabus below for course "${courseName}".

Today is ${today}. If a year is missing from a date, infer from context (assume the upcoming academic term).

Reply with ONLY a JSON array — no markdown fences, no explanation:
[
  {
    "title": "descriptive task name",
    "due_date": "YYYY-MM-DD",
    "item_type": "Homework|Quiz|Exam|Midterm|Final|Project|Lab|Paper|Presentation|Task",
    "weight": <percentage 0-100, or 10 if not mentioned>,
    "estimated_effort_hours": <realistic hours: Quiz=1, Homework=2, Lab=2, Exam/Midterm=4, Final=5, Project=6, Paper=5, Presentation=3>
  }
]

Skip readings, lectures, office hours, class sessions, and non-graded items.
If no graded items found, return [].

Syllabus:
${text}`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const rawText = completion.choices[0].message.content || "";

    // json_object mode wraps arrays in an object — unwrap if needed
    const match = rawText.match(/\[[\s\S]*\]/);
    if (!match) {
      console.warn("Groq returned no JSON array, falling back to regex parser");
      return regexFallback(text, courseName);
    }

    const parsed = JSON.parse(match[0]);
    return buildItems(parsed, courseName);
  } catch (err) {
    console.error("Groq API failed, using regex fallback:", err.message);
    return regexFallback(text, courseName);
  }
}

function buildItems(parsed, courseName) {
  return parsed
    .filter((it) => it.title && it.due_date)
    .map((it) => {
      const obj = {
        id: uid(),
        course: courseName,
        item_type: it.item_type || "Task",
        title: String(it.title).slice(0, 120),
        due_date: it.due_date,
        estimated_effort_hours: Number(it.estimated_effort_hours) || 2,
        weight: Number(it.weight) || 10,
        completed: false,
      };
      obj.priority_score = priorityScore(obj);
      return obj;
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

// ── Regex fallback (used when GROQ_API_KEY is unset or the API call fails) ──

const KEYWORDS = [
  "homework", "hw", "assignment", "quiz",
  "exam", "midterm", "final", "project",
  "lab", "presentation", "paper",
];

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function tryParseDate(raw) {
  raw = raw.trim();
  let m = raw.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = raw.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return new Date(y, Number(m[1]) - 1, Number(m[2]));
  }
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

function regexFallback(text, courseName) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items = [];

  for (const line of lines) {
    if (!KEYWORDS.some((k) => line.toLowerCase().includes(k))) continue;
    const dateMatch = line.match(
      /\b(20\d{2}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+20\d{2})\b/
    );
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

    const obj = {
      id: uid(),
      course: courseName,
      item_type: type,
      title: title || `${type} item`,
      due_date: due.toISOString().slice(0, 10),
      estimated_effort_hours: est,
      weight: 10,
      completed: false,
    };
    obj.priority_score = priorityScore(obj);
    items.push(obj);
  }

  return items.sort((a, b) => a.due_date.localeCompare(b.due_date));
}
