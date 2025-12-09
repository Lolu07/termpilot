import express from "express";
import cors from "cors";
import multer from "multer";
import pdf from "pdf-parse";
import { parseSyllabusText } from "./syllabusParser.js";
import { loadDB, saveDB, upsertCourse } from "./storage.js";

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

// Create/replace a course from pasted text
app.post("/api/courses/from-text", (req, res) => {
  const { courseName, text } = req.body || {};
  if (!courseName || !text) {
    return res.status(400).json({ error: "courseName and text are required" });
  }
  const items = parseSyllabusText(text, courseName);
  const course = upsertCourse(courseName, items);
  res.json(course);
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
    const items = parseSyllabusText(text, courseName);
    const course = upsertCourse(courseName, items);
    res.json(course);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to parse PDF" });
  }
});

// Mark item as completed
app.patch("/api/items/:id/complete", (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  let updatedItem = null;

  db.courses.forEach(c => {
    c.items.forEach(it => {
      if (it.id === id) {
        it.completed = true;
        updatedItem = it;
      }
    });
  });

  if (!updatedItem) return res.status(404).json({ error: "Item not found" });
  saveDB(db);
  res.json(updatedItem);
});

// Reset database 
app.post("/api/reset", (req, res) => {
  saveDB({ courses: [] });
  res.json({ ok: true });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`TermPilot backend running on :${PORT}`));