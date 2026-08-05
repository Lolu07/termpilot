import express from "express";
import cors from "cors";
import multer from "multer";
import pdf from "pdf-parse";
import crypto from "node:crypto";
import { parseSyllabus } from "./syllabusParser.js";
import { hasUsablePdfText, normalizeExtractedText, renderPdfPage } from "./pdfText.js";
import { isReplacementConfirmed, materializeReviewedItems, validateReviewedImport } from "./reviewValidation.js";
import { loadDB, saveDB, upsertCourse, deleteCourse, addItemToCourse, updateItem, deleteItem } from "./storage.js";

const app = express();
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PDF_PAGES = 75;
const MAX_SYLLABUS_CHARACTERS = 150_000;
const PARSE_LIMIT = 20;
const PARSE_WINDOW_MS = 15 * 60 * 1000;
const parseRequests = new Map();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowedMimeTypes = new Set(["application/pdf", "application/octet-stream"]);
    const isPdf = allowedMimeTypes.has(file.mimetype) && file.originalname.toLowerCase().endsWith(".pdf");
    if (isPdf) return callback(null, true);
    const error = new Error("Only PDF files are supported");
    error.code = "INVALID_PDF_TYPE";
    return callback(error);
  },
});

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "https://termpilot.vercel.app,http://localhost:5173")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean),
);

app.set("trust proxy", 1);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
}));
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID().slice(0, 8);
  res.setHeader("X-Request-ID", req.requestId);
  next();
});

function parseRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || "unknown";
  const recent = (parseRequests.get(key) || []).filter(timestamp => now - timestamp < PARSE_WINDOW_MS);
  if (recent.length >= PARSE_LIMIT) {
    return res.status(429).json({ error: "Too many parsing requests. Please wait a few minutes and try again." });
  }
  recent.push(now);
  parseRequests.set(key, recent);
  return next();
}

app.get("/api/health", (_req, res) => res.json({
  ok: true,
  ai_parser: process.env.GROQ_API_KEY ? "configured" : "fallback_only",
  persistence: "json_demo",
}));

// Get all courses + items
app.get("/api/courses", (req, res) => {
  const db = loadDB();
  res.json(db.courses);
});

async function textParseHandler(req, res) {
    const { courseName, text } = req.body || {};
    if (typeof courseName !== "string" || typeof text !== "string" || !courseName.trim() || !text.trim()) {
      return res.status(400).json({ error: "courseName and text are required" });
    }
    try {
      const safeCourseName = courseName.trim().slice(0, 100);
      const normalizedText = normalizeExtractedText(text);
      if (normalizedText.length > MAX_SYLLABUS_CHARACTERS) {
        return res.status(413).json({ error: "Syllabus text must be 150,000 characters or fewer" });
      }
      const parsed = await parseSyllabus(normalizedText, safeCourseName);
      if (parsed.items.length === 0) {
        return res.status(422).json({
          error: "No graded items with recognizable due dates were found. Check the syllabus text and try again.",
          parse_info: parsed.meta,
        });
      }
      const parseInfo = {
        ...parsed.meta,
        input_type: "text",
        character_count: normalizedText.length,
        request_id: req.requestId,
      };
      console.info(`[parse:${req.requestId}] text engine=${parseInfo.engine} items=${parsed.items.length} chars=${normalizedText.length}`);
      return res.json({ courseName: safeCourseName, items: parsed.items, parse_info: parseInfo });
    } catch (error) {
      console.error(`[parse:${req.requestId}] text processing failed:`, error.message);
      return res.status(500).json({ error: "Failed to parse syllabus" });
    }
}

async function pdfParseHandler(req, res) {
    try {
      const courseName = req.body.courseName;
      if (typeof courseName !== "string" || !courseName.trim() || !req.file) {
        return res.status(400).json({ error: "courseName and file are required" });
      }
      const safeCourseName = courseName.trim().slice(0, 100);
      if (req.file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
        return res.status(415).json({ error: "The uploaded file does not appear to be a valid PDF" });
      }
      const pdfData = await pdf(req.file.buffer, { pagerender: renderPdfPage });
      const text = normalizeExtractedText(pdfData.text);
      if (pdfData.numpages > MAX_PDF_PAGES) {
        return res.status(413).json({ error: `PDF files must be ${MAX_PDF_PAGES} pages or fewer` });
      }
      if (text.length > MAX_SYLLABUS_CHARACTERS) {
        return res.status(413).json({ error: "Extracted PDF text is too long to process safely" });
      }
      if (!hasUsablePdfText(text)) {
        return res.status(422).json({
          error: "No readable text was found in this PDF. It may be scanned or image-only; use Paste Text or upload a text-based PDF.",
        });
      }

      const parsed = await parseSyllabus(text, safeCourseName);
      if (parsed.items.length === 0) {
        return res.status(422).json({
          error: "The PDF text was extracted, but no graded items with recognizable due dates were found.",
          parse_info: parsed.meta,
        });
      }

      const parseInfo = {
        ...parsed.meta,
        input_type: "pdf",
        pages: pdfData.numpages,
        character_count: text.length,
        filename: req.file.originalname,
        request_id: req.requestId,
      };
      console.info(`[parse:${req.requestId}] pdf engine=${parseInfo.engine} items=${parsed.items.length} pages=${pdfData.numpages} chars=${text.length}`);
      return res.json({ courseName: safeCourseName, items: parsed.items, parse_info: parseInfo });
    } catch (error) {
      console.error(`[parse:${req.requestId}] PDF processing failed:`, error.message);
      return res.status(422).json({ error: "The PDF could not be read. It may be damaged, encrypted, or use an unsupported format." });
    }
}

// Preview routes do not persist or replace course data.
app.post("/api/parse/text", parseRateLimit, textParseHandler);
app.post("/api/parse/pdf", parseRateLimit, upload.single("file"), pdfParseHandler);

app.post("/api/courses/import", (req, res) => {
  const { courseName, items, parseInfo, replace = false } = req.body || {};
  if (typeof courseName !== "string" || !courseName.trim() || !Array.isArray(items)) {
    return res.status(400).json({ error: "courseName and items are required" });
  }

  const safeCourseName = courseName.trim().slice(0, 100);
  const issues = validateReviewedImport(courseName, items);
  if (issues.length > 0) {
    return res.status(400).json({
      error: "Review the highlighted fields before importing.",
      code: "VALIDATION_ERROR",
      issues,
    });
  }
  const exists = loadDB().courses.some(course => course.name.toLowerCase() === safeCourseName.toLowerCase());
  const replacementConfirmed = isReplacementConfirmed(replace);
  if (exists && !replacementConfirmed) {
    return res.status(409).json({
      error: `A course named "${safeCourseName}" already exists. Confirm replacement to continue.`,
      code: "COURSE_EXISTS",
    });
  }

  const reviewedItems = materializeReviewedItems(items, safeCourseName);
  if (reviewedItems.length === 0) {
    return res.status(422).json({ error: "Add at least one valid task before importing the course" });
  }

  const safeParseInfo = {
    engine: parseInfo?.engine === "groq" ? "groq" : "fallback",
    input_type: parseInfo?.input_type === "pdf" ? "pdf" : "text",
    item_count: reviewedItems.length,
    extracted_item_count: Number.isFinite(Number(parseInfo?.item_count)) ? Number(parseInfo.item_count) : reviewedItems.length,
    ...(parseInfo?.pages != null && Number.isFinite(Number(parseInfo.pages)) ? { pages: Number(parseInfo.pages) } : {}),
    ...(parseInfo?.character_count != null && Number.isFinite(Number(parseInfo.character_count)) ? { character_count: Number(parseInfo.character_count) } : {}),
    ...(typeof parseInfo?.filename === "string" ? { filename: parseInfo.filename.slice(0, 160) } : {}),
    reviewed: true,
    imported_at: new Date().toISOString(),
  };

  const course = upsertCourse(safeCourseName, reviewedItems, safeParseInfo);
  return res.status(exists ? 200 : 201).json(course);
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

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "PDF files must be 10 MB or smaller" });
  }
  if (err?.code === "INVALID_PDF_TYPE") {
    return res.status(415).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: "Unexpected server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`TermPilot backend running on :${PORT}`));
