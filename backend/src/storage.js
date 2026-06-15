import fs from "fs";
import path from "path";
import { priorityScore } from "./priority.js";
import { uid } from "./util.js";

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

export function upsertCourse(courseName, items) {
  const db = loadDB();
  const idx = db.courses.findIndex(c => c.name.toLowerCase() === courseName.toLowerCase());
  const course = {
    name: courseName,
    items: items.map(it => ({ ...it, priority_score: priorityScore(it) })),
  };

  if (idx >= 0) db.courses[idx] = course;
  else db.courses.push(course);

  saveDB(db);
  return course;
}

export function deleteCourse(courseName) {
  const db = loadDB();
  const before = db.courses.length;
  db.courses = db.courses.filter(c => c.name.toLowerCase() !== courseName.toLowerCase());
  if (db.courses.length === before) return false;
  saveDB(db);
  return true;
}

export function addItemToCourse(courseName, fields) {
  const db = loadDB();
  const course = db.courses.find(c => c.name.toLowerCase() === courseName.toLowerCase());
  if (!course) return null;

  const item = {
    id: uid(),
    course: courseName,
    item_type: fields.item_type || "Task",
    title: String(fields.title || "Untitled").slice(0, 120),
    due_date: fields.due_date,
    estimated_effort_hours: Number(fields.estimated_effort_hours) || 2,
    weight: Number(fields.weight) || 10,
    completed: false,
  };
  item.priority_score = priorityScore(item);
  course.items.push(item);
  saveDB(db);
  return item;
}

export function updateItem(id, updates) {
  const db = loadDB();
  let found = null;

  for (const course of db.courses) {
    const idx = course.items.findIndex(it => it.id === id);
    if (idx >= 0) {
      course.items[idx] = { ...course.items[idx], ...updates };
      course.items[idx].priority_score = priorityScore(course.items[idx]);
      found = course.items[idx];
      break;
    }
  }

  if (found) saveDB(db);
  return found;
}

export function deleteItem(id) {
  const db = loadDB();
  for (const course of db.courses) {
    const idx = course.items.findIndex(it => it.id === id);
    if (idx >= 0) {
      course.items.splice(idx, 1);
      saveDB(db);
      return true;
    }
  }
  return false;
}
