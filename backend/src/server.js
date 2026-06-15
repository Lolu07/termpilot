import express from "express";
import cors from "cors";
import multer from "multer";
import pdf from "pdf-parse";
import { parseSyllabusText } from "./syllabusParser.js";
import { loadDB, saveDB, upsertCourse, deleteCourse, addItemToCourse, updateItem, deleteItem } from "./storage.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Get all courses + items
app.get("/api/courses", (req, res) => {
  const db = loadDB();
  res.json(db.courses);
});

// Create/replace a course from pasted text (AI parsing)
app.post("/api/courses/from-text", async (req, res) => {
  const { courseName, text } = req.body || {};
  if (!courseName || !text) {
    return res.status(400).json({ error: "courseName and text are required" });
  }
  try {
    const items = await parseSyllabusText(text, courseName);
    const course = upsertCourse(courseName, items);
    res.json(course);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to parse syllabus" });
  }
});

// Create/replace a course from PDF upload
app.post("/api/courses/from-pdf", upload.single("file"), async (req, res) => {
  try {
    const courseName = req.body.courseName;
    if (!courseName || !req.file) {
      return res.status(400).json({ error: "courseName and file are required" });
    }
    const pdfData = await pdf(req.file.buffer);
    const text = pdfData.text || "";
    const items = await parseSyllabusText(text, courseName);
    const course = upsertCourse(courseName, items);
    res.json(course);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to parse PDF" });
  }
});

// Delete a course
app.delete("/api/courses/:name", (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const removed = deleteCourse(name);
  if (!removed) return res.status(404).json({ error: "Course not found" });
  res.json({ ok: true });
});

// Manually create an item in an existing course
app.post("/api/items", (req, res) => {
  const { course, title, due_date, item_type, weight, estimated_effort_hours } = req.body || {};
  if (!course || !title || !due_date) {
    return res.status(400).json({ error: "course, title, and due_date are required" });
  }
  const item = addItemToCourse(course, { title, due_date, item_type, weight, estimated_effort_hours });
  if (!item) return res.status(404).json({ error: "Course not found" });
  res.status(201).json(item);
});

// Edit an item (partial update)
app.patch("/api/items/:id", (req, res) => {
  const { id } = req.params;
  const allowed = ["title", "due_date", "item_type", "weight", "estimated_effort_hours", "completed"];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  const item = updateItem(id, updates);
  if (!item) return res.status(404).json({ error: "Item not found" });
  res.json(item);
});

// Mark item as completed (convenience alias for PATCH)
app.patch("/api/items/:id/complete", (req, res) => {
  const { id } = req.params;
  const item = updateItem(id, { completed: true });
  if (!item) return res.status(404).json({ error: "Item not found" });
  res.json(item);
});

// Delete an item
app.delete("/api/items/:id", (req, res) => {
  const { id } = req.params;
  const removed = deleteItem(id);
  if (!removed) return res.status(404).json({ error: "Item not found" });
  res.json({ ok: true });
});

// Reset database
app.post("/api/reset", (req, res) => {
  saveDB({ courses: [] });
  res.json({ ok: true });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`TermPilot backend running on :${PORT}`));
