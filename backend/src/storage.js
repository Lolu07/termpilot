import fs from "fs";
import path from "path";
import { priorityScore } from "./priority.js";

const DB_PATH = path.join(process.cwd(), "src", "data", "db.json");

export function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify({ courses: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

export function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// Replace or insert course
export function upsertCourse(courseName, items) {
  const db = loadDB();
  const idx = db.courses.findIndex(c => c.name.toLowerCase() === courseName.toLowerCase());
  const course = {
    name: courseName,
    items: items.map(it => ({ ...it, priority_score: priorityScore(it) }))
  };

  if (idx >= 0) db.courses[idx] = course;
  else db.courses.push(course);

  saveDB(db);
  return course;
}