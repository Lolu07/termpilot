import React, { useRef, useState } from "react";
import { formatDateKey } from "../dateUtils.js";
import { DocumentIcon } from "./Icons.jsx";

const ITEM_TYPES = ["Homework", "Quiz", "Exam", "Midterm", "Final", "Project", "Lab", "Paper", "Presentation", "Task"];
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const TABS = ["text", "pdf", "manual"];

function dateAfter(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

const EXAMPLES = {
  "CS 201": {
    name: "CS 201",
    text: `CS 201 — Data Structures (Upcoming Term)

Grading:
  Homework (6 assignments) — 30%
  Quizzes (4 quizzes) — 10%
  Midterm Exam — 25%
  Final Project — 20%
  Final Exam — 15%

Schedule:
  Homework 1 due ${dateAfter(7)} (5%)
  Quiz 1 due ${dateAfter(12)} (2.5%)
  Homework 2 due ${dateAfter(18)} (5%)
  Quiz 2 due ${dateAfter(25)} (2.5%)
  Homework 3 due ${dateAfter(32)} (5%)
  Midterm Exam due ${dateAfter(40)} (25%)
  Homework 4 due ${dateAfter(49)} (5%)
  Quiz 3 due ${dateAfter(56)} (2.5%)
  Homework 5 due ${dateAfter(63)} (5%)
  Quiz 4 due ${dateAfter(70)} (2.5%)
  Homework 6 due ${dateAfter(77)} (5%)
  Final Project due ${dateAfter(86)} (20%)
  Final Exam due ${dateAfter(94)} (15%)`,
  },
  "MATH 251": {
    name: "MATH 251",
    text: `MATH 251 — Calculus II (Upcoming Term)

Grading: HW 25%, Labs 15%, Exams 35%, Final 25%

HW A due ${dateAfter(6)}
Lab 1 due ${dateAfter(13)}
HW B due ${dateAfter(20)}
Quiz 1 due ${dateAfter(27)}
Exam 1 due ${dateAfter(34)}
Lab 2 due ${dateAfter(41)}
HW C due ${dateAfter(48)}
Lab 3 due ${dateAfter(55)}
Exam 2 due ${dateAfter(62)}
HW D due ${dateAfter(69)}
Final Presentation due ${dateAfter(82)}
Final Exam due ${dateAfter(96)}`,
  },
};

export default function UploadForm({ onUploadText, onUploadPDF, onAddTask, loading, courseNames }) {
  const [tab, setTab] = useState("text");
  const [courseName, setCourseName] = useState("");
  const [text, setText] = useState("");
  const [example, setExample] = useState("");
  const [pdfCourse, setPdfCourse] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfError, setPdfError] = useState("");
  const [manualCourse, setManualCourse] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [manualType, setManualType] = useState("Homework");
  const [manualWeight, setManualWeight] = useState(10);
  const [manualEffort, setManualEffort] = useState(2);
  const fileRef = useRef(null);

  function loadExample(key) {
    if (!key) return;
    const ex = EXAMPLES[key];
    setExample(key);
    setCourseName(ex.name);
    setText(ex.text);
  }

  function selectPdfFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setPdfError("Choose a PDF file.");
      setPdfFile(null);
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setPdfError("PDF files must be 10 MB or smaller.");
      setPdfFile(null);
      return;
    }
    setPdfError("");
    setPdfFile(file);
    if (!pdfCourse) setPdfCourse(file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " "));
  }

  function handleFileChange(e) {
    selectPdfFile(e.target.files?.[0]);
  }

  function clearPdf() {
    setPdfFile(null);
    setPdfCourse("");
    setPdfError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function submitManual(e) {
    e.preventDefault();
    if (!manualCourse || !manualTitle || !manualDate) return;
    onAddTask({
      course: manualCourse,
      title: manualTitle,
      due_date: manualDate,
      item_type: manualType,
      weight: Number(manualWeight),
      estimated_effort_hours: Number(manualEffort),
    });
    setManualTitle("");
    setManualDate("");
  }

  function handleTabKeys(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = TABS.indexOf(tab);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? TABS.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    const nextTab = TABS[nextIndex];
    setTab(nextTab);
    requestAnimationFrame(() => document.getElementById(`import-tab-${nextTab}`)?.focus());
  }

  return (
    <div className="card" id="syllabus-import">
      <div className="upload-tabs" role="tablist" aria-label="Add course content" onKeyDown={handleTabKeys}>
        <button id="import-tab-text" type="button" role="tab" aria-selected={tab === "text"} aria-controls="import-panel-text" tabIndex={tab === "text" ? 0 : -1} className={`tab-btn${tab === "text" ? " active" : ""}`} onClick={() => setTab("text")}>
          Paste Text
        </button>
        <button id="import-tab-pdf" type="button" role="tab" aria-selected={tab === "pdf"} aria-controls="import-panel-pdf" tabIndex={tab === "pdf" ? 0 : -1} className={`tab-btn${tab === "pdf" ? " active" : ""}`} onClick={() => setTab("pdf")}>
          Upload PDF
        </button>
        <button id="import-tab-manual" type="button" role="tab" aria-selected={tab === "manual"} aria-controls="import-panel-manual" tabIndex={tab === "manual" ? 0 : -1} className={`tab-btn${tab === "manual" ? " active" : ""}`} onClick={() => setTab("manual")}>
          Add Task
        </button>
      </div>

      {tab === "text" && (
        <div id="import-panel-text" className="tab-body" role="tabpanel" aria-labelledby="import-tab-text">
          <div className="split">
            <input
              aria-label="Course name"
              placeholder="Course name (e.g., CS 201)"
              value={courseName}
              onChange={e => setCourseName(e.target.value)}
            />
            <select aria-label="Load an example syllabus" value={example} onChange={e => loadExample(e.target.value)}>
              <option value="">Load example…</option>
              {Object.keys(EXAMPLES).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <textarea
            aria-label="Syllabus text"
            placeholder="Paste your full syllabus here. AI will extract all assignments, exams, and due dates automatically."
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button disabled={!courseName || !text || loading} onClick={() => onUploadText(courseName, text)}>
              {loading ? <span className="loading-text"><span className="spinner" /> Analyzing syllabus…</span> : "Analyze syllabus"}
            </button>
            <button className="btn-ghost" onClick={() => { setText(""); setCourseName(""); setExample(""); }} disabled={loading}>
              Clear
            </button>
          </div>
          <small className="hint">TermPilot extracts the deadlines, then lets you verify every field before anything is saved.</small>
        </div>
      )}

      {tab === "pdf" && (
        <div id="import-panel-pdf" className="tab-body" role="tabpanel" aria-labelledby="import-tab-pdf">
          <input
            aria-label="PDF course name"
            placeholder="Course name (e.g., BIO 110)"
            value={pdfCourse}
            onChange={e => setPdfCourse(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <div
            className={`drop-zone${pdfFile ? " has-file" : ""}`}
            onClick={() => fileRef.current?.click()}
            onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileRef.current?.click();
              }
            }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              selectPdfFile(e.dataTransfer.files[0]);
            }}
            role="button"
            tabIndex={0}
            aria-label={pdfFile ? `Selected PDF: ${pdfFile.name}` : "Choose or drop a PDF syllabus"}
          >
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" style={{ display: "none" }} onChange={handleFileChange} />
            {pdfFile
              ? <span><DocumentIcon size={22} /> {pdfFile.name}<small>{(pdfFile.size / (1024 * 1024)).toFixed(1)} MB</small></span>
              : <span>Click or drag and drop a PDF syllabus<small>Text-based PDF, up to 10 MB</small></span>}
          </div>
          {pdfError && <div className="form-error" role="alert">{pdfError}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button disabled={!pdfCourse || !pdfFile || loading} onClick={() => onUploadPDF(pdfCourse, pdfFile)}>
              {loading ? <span className="loading-text"><span className="spinner" /> Extracting and analyzing…</span> : "Analyze PDF"}
            </button>
            {pdfFile && (
              <button className="btn-ghost" onClick={clearPdf} disabled={loading}>
                Clear
              </button>
            )}
          </div>
          <small className="hint">Your syllabus text is sent to Groq for deadline extraction. TermPilot does not store the raw document text.</small>
        </div>
      )}

      {tab === "manual" && (
        <form id="import-panel-manual" className="tab-body manual-form" role="tabpanel" aria-labelledby="import-tab-manual" onSubmit={submitManual}>
          <div className="split">
            <select aria-label="Course for new task" value={manualCourse} onChange={e => setManualCourse(e.target.value)} required>
              <option value="">Select course…</option>
              {courseNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select aria-label="Task type" value={manualType} onChange={e => setManualType(e.target.value)}>
              {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <input
            aria-label="Task title"
            placeholder="Task title (e.g., Homework 4)"
            value={manualTitle}
            onChange={e => setManualTitle(e.target.value)}
            required
          />
          <div className="triple-split">
            <div>
              <label className="field-label">Due date</label>
              <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} required />
            </div>
            <div>
              <label className="field-label">Weight (%)</label>
              <input type="number" min="0" max="100" value={manualWeight} onChange={e => setManualWeight(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Effort (hrs)</label>
              <input type="number" min="0.5" max="40" step="0.5" value={manualEffort} onChange={e => setManualEffort(e.target.value)} />
            </div>
          </div>
          <button type="submit" disabled={!manualCourse || !manualTitle || !manualDate || loading}>
            Add Task
          </button>
          {courseNames.length === 0 && (
            <small className="hint">Upload a syllabus first to create a course, then add tasks here.</small>
          )}
        </form>
      )}
    </div>
  );
}
