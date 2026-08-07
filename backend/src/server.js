import path from "node:path";
import { pathToFileURL } from "node:url";
import express from "express";
import cors from "cors";
import multer from "multer";
import pdf from "pdf-parse";
import crypto from "node:crypto";
import { parseSyllabus } from "./syllabusParser.js";
import { hasUsablePdfText, normalizeExtractedText, renderPdfPage } from "./pdfText.js";
import { isReplacementConfirmed, validateReviewedImport } from "./reviewValidation.js";
import { createSupabaseAuthFromEnv } from "./auth.js";
import { createSupabaseRepository, RepositoryError } from "./repository.js";
import { buildDemoCourses } from "./demoWorkspace.js";
import {
  isUuid,
  normalizeItemPatch,
  normalizeNewItem,
  reviewedPrecisionIssues,
  sanitizeParseInfo,
  sanitizeReviewedItems,
} from "./apiValidation.js";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PDF_PAGES = 75;
const MAX_SYLLABUS_CHARACTERS = 150_000;
const PARSE_LIMIT = 20;
const DEMO_PARSE_LIMIT = 5;
const DEMO_IP_PARSE_LIMIT = 15;
const PARSE_WINDOW_MS = 15 * 60 * 1000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowedMimeTypes = new Set(["application/pdf", "application/octet-stream"]);
    const isPdf = allowedMimeTypes.has(file.mimetype)
      && file.originalname.toLowerCase().endsWith(".pdf");
    if (isPdf) return callback(null, true);
    const error = new Error("Only PDF files are supported");
    error.code = "INVALID_PDF_TYPE";
    return callback(error);
  },
});

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function validationError(res, issues) {
  return res.status(400).json({
    error: "Review the highlighted fields and try again.",
    code: "VALIDATION_ERROR",
    issues,
  });
}

function uuidIssue(pathName) {
  return [{ path: pathName, message: "A valid UUID is required." }];
}

export function createApp({
  env = process.env,
  authenticate,
  repository = createSupabaseRepository(),
  parseSyllabusFn = parseSyllabus,
  pdfParser = pdf,
  logger = console,
} = {}) {
  const app = express();
  const requireAuth = authenticate || createSupabaseAuthFromEnv(env);
  const parseRequests = new Map();
  const allowedOrigins = new Set(
    (env.ALLOWED_ORIGINS || "https://termpilot.vercel.app,http://localhost:5173")
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
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID().slice(0, 8);
    res.setHeader("X-Request-ID", req.requestId);
    next();
  });

  app.get("/api/health", (_req, res) => res.json({
    ok: true,
    ai_parser: env.GROQ_API_KEY ? "configured" : "fallback_only",
    auth: "supabase",
    persistence: "supabase",
  }));

  // CORS handles OPTIONS before this point. Every application API below this
  // line requires a verified Supabase access token.
  app.use("/api", requireAuth);
  app.use("/api", express.json({ limit: "2mb" }));

  function parseRateLimit(req, res, next) {
    const now = Date.now();
    const anonymous = req.auth?.claims?.is_anonymous === true;
    const buckets = [
      [`user:${req.auth?.userId || "unknown"}`, anonymous ? DEMO_PARSE_LIMIT : PARSE_LIMIT],
      ...(anonymous ? [[`demo-ip:${req.ip || "unknown"}`, DEMO_IP_PARSE_LIMIT]] : []),
    ];

    const limited = buckets.some(([key, limit]) => {
      const recent = (parseRequests.get(key) || [])
        .filter(timestamp => now - timestamp < PARSE_WINDOW_MS);
      parseRequests.set(key, recent);
      return recent.length >= limit;
    });
    if (limited) {
      return res.status(429).json({
        error: anonymous
          ? "This demo has reached its short-term AI extraction limit. Please wait a few minutes and try again."
          : "Too many parsing requests. Please wait a few minutes and try again.",
        code: "RATE_LIMITED",
      });
    }
    for (const [key] of buckets) parseRequests.get(key).push(now);
    return next();
  }

  function isAnonymousDemo(req) {
    return req.auth?.claims?.is_anonymous === true;
  }

  async function seedDemoWorkspace(req, existingCourses = []) {
    let seeded = false;
    const existingNames = new Set(existingCourses.map(course => course.name.toLowerCase()));
    for (const demoCourse of buildDemoCourses()) {
      if (existingNames.has(demoCourse.courseName.toLowerCase())) continue;
      try {
        const result = await repository.importReviewedCourse(
          req.supabase,
          req.auth.userId,
          demoCourse,
        );
        seeded = result.created === true || seeded;
      } catch (error) {
        // React StrictMode and two quick browser requests can race while the
        // first demo is being created. A name conflict means another request
        // already created that canonical course, so the final list is valid.
        if (!(error instanceof RepositoryError) || error.code !== "COURSE_EXISTS") throw error;
      }
    }
    const courses = await repository.listCourses(req.supabase, req.auth.userId);
    return { courses, seeded };
  }

  function demoOnly(req, res) {
    if (isAnonymousDemo(req)) return true;
    res.status(403).json({
      error: "This action is available only inside a live demo workspace.",
      code: "DEMO_ONLY",
    });
    return false;
  }

  app.post("/api/demo/bootstrap", asyncRoute(async (req, res) => {
    if (!demoOnly(req, res)) return;
    res.setHeader("Cache-Control", "no-store");
    const existing = await repository.listCourses(req.supabase, req.auth.userId);
    const result = await seedDemoWorkspace(req, existing);
    return res.status(result.seeded ? 201 : 200).json(result);
  }));

  app.post("/api/demo/reset", asyncRoute(async (req, res) => {
    if (!demoOnly(req, res)) return;
    res.setHeader("Cache-Control", "no-store");
    await repository.deleteOwnData(req.supabase, req.auth.userId);
    const result = await seedDemoWorkspace(req);
    return res.json({ ...result, reset: true });
  }));

  app.get("/api/courses", asyncRoute(async (req, res) => {
    const courses = await repository.listCourses(req.supabase, req.auth.userId);
    res.json(courses);
  }));

  app.post("/api/parse/text", parseRateLimit, asyncRoute(async (req, res) => {
    const { courseName, text } = req.body || {};
    if (typeof courseName !== "string" || typeof text !== "string"
      || !courseName.trim() || !text.trim()) {
      return res.status(400).json({ error: "courseName and text are required" });
    }

    const safeCourseName = courseName.trim().slice(0, 100);
    const normalizedText = normalizeExtractedText(text);
    if (normalizedText.length > MAX_SYLLABUS_CHARACTERS) {
      return res.status(413).json({ error: "Syllabus text must be 150,000 characters or fewer" });
    }

    try {
      const parsed = await parseSyllabusFn(normalizedText, safeCourseName);
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
      logger.info?.(`[parse:${req.requestId}] text engine=${parseInfo.engine} items=${parsed.items.length} chars=${normalizedText.length}`);
      return res.json({ courseName: safeCourseName, items: parsed.items, parse_info: parseInfo });
    } catch (error) {
      logger.error?.(`[parse:${req.requestId}] text processing failed: ${error.message}`);
      return res.status(500).json({ error: "Failed to parse syllabus" });
    }
  }));

  app.post(
    "/api/parse/pdf",
    parseRateLimit,
    upload.single("file"),
    asyncRoute(async (req, res) => {
      try {
        const courseName = req.body.courseName;
        if (typeof courseName !== "string" || !courseName.trim() || !req.file) {
          return res.status(400).json({ error: "courseName and file are required" });
        }
        const safeCourseName = courseName.trim().slice(0, 100);
        if (req.file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
          return res.status(415).json({ error: "The uploaded file does not appear to be a valid PDF" });
        }
        const pdfData = await pdfParser(req.file.buffer, { pagerender: renderPdfPage });
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

        const parsed = await parseSyllabusFn(text, safeCourseName);
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
        logger.info?.(`[parse:${req.requestId}] pdf engine=${parseInfo.engine} items=${parsed.items.length} pages=${pdfData.numpages} chars=${text.length}`);
        return res.json({ courseName: safeCourseName, items: parsed.items, parse_info: parseInfo });
      } catch (error) {
        logger.error?.(`[parse:${req.requestId}] PDF processing failed: ${error.message}`);
        return res.status(422).json({
          error: "The PDF could not be read. It may be damaged, encrypted, or use an unsupported format.",
        });
      }
    }),
  );

  app.post("/api/courses/import", asyncRoute(async (req, res) => {
    const { courseName, items, parseInfo, replace = false } = req.body || {};
    const issues = [
      ...validateReviewedImport(courseName, items),
      ...reviewedPrecisionIssues(items),
    ];
    if (issues.length > 0) return validationError(res, issues);

    const reviewedItems = sanitizeReviewedItems(items);
    const safeParseInfo = sanitizeParseInfo(parseInfo, reviewedItems.length);
    const result = await repository.importReviewedCourse(req.supabase, req.auth.userId, {
      courseName: courseName.trim(),
      items: reviewedItems,
      parseInfo: safeParseInfo,
      replace: isReplacementConfirmed(replace),
    });
    return res.status(result.created ? 201 : 200).json(result.course);
  }));

  app.delete("/api/courses/:id", asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) return validationError(res, uuidIssue("course_id"));
    const removed = await repository.deleteCourse(req.supabase, req.auth.userId, req.params.id);
    if (!removed) return res.status(404).json({ error: "Course not found", code: "NOT_FOUND" });
    return res.json({ ok: true });
  }));

  app.post("/api/items", asyncRoute(async (req, res) => {
    const normalized = normalizeNewItem(req.body || {});
    if (normalized.issues.length > 0) return validationError(res, normalized.issues);
    const item = await repository.createItem(req.supabase, req.auth.userId, normalized.value);
    if (!item) return res.status(404).json({ error: "Course not found", code: "NOT_FOUND" });
    return res.status(201).json(item);
  }));

  app.patch("/api/items/:id", asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) return validationError(res, uuidIssue("item_id"));
    const normalized = normalizeItemPatch(req.body || {});
    if (normalized.issues.length > 0) return validationError(res, normalized.issues);
    const item = await repository.updateItem(
      req.supabase,
      req.auth.userId,
      req.params.id,
      normalized.value,
    );
    if (!item) return res.status(404).json({ error: "Item not found", code: "NOT_FOUND" });
    return res.json(item);
  }));

  app.patch("/api/items/:id/complete", asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) return validationError(res, uuidIssue("item_id"));
    const item = await repository.updateItem(
      req.supabase,
      req.auth.userId,
      req.params.id,
      { completed: true },
    );
    if (!item) return res.status(404).json({ error: "Item not found", code: "NOT_FOUND" });
    return res.json(item);
  }));

  app.delete("/api/items/:id", asyncRoute(async (req, res) => {
    if (!isUuid(req.params.id)) return validationError(res, uuidIssue("item_id"));
    const removed = await repository.deleteItem(req.supabase, req.auth.userId, req.params.id);
    if (!removed) return res.status(404).json({ error: "Item not found", code: "NOT_FOUND" });
    return res.json({ ok: true });
  }));

  app.delete("/api/account/data", asyncRoute(async (req, res) => {
    await repository.deleteOwnData(req.supabase, req.auth.userId);
    return res.json({ ok: true });
  }));

  app.use("/api", (_req, res) => res.status(404).json({
    error: "API route not found",
    code: "NOT_FOUND",
  }));

  app.use((err, req, res, _next) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "PDF files must be 10 MB or smaller" });
    }
    if (err?.code === "INVALID_PDF_TYPE") {
      return res.status(415).json({ error: err.message });
    }
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Request body must contain valid JSON" });
    }
    if (err?.type === "entity.too.large") {
      return res.status(413).json({ error: "Request body is too large" });
    }
    if (err instanceof RepositoryError) {
      if (err.status >= 500) {
        logger.error?.(`[request:${req.requestId}] ${err.message}`, err.cause || "");
      }
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    logger.error?.(`[request:${req.requestId}] Unexpected server error`, err);
    return res.status(500).json({ error: "Unexpected server error", code: "INTERNAL_ERROR" });
  });

  return app;
}

export function startServer({ env = process.env, logger = console } = {}) {
  const app = createApp({ env, logger });
  const port = Number(env.PORT) || 4000;
  return app.listen(port, () => logger.log(`TermPilot backend running on :${port}`));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    startServer();
  } catch (error) {
    console.error(`TermPilot backend failed to start: ${error.message}`);
    process.exitCode = 1;
  }
}
