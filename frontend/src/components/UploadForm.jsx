import React, { useRef, useState } from "react";

const ITEM_TYPES = ["Homework", "Quiz", "Exam", "Midterm", "Final", "Project", "Lab", "Paper", "Presentation", "Task"];

const EXAMPLES = {
  "CS 201": {
    name: "CS 201",
    text: `CS 201 — Data Structures (Spring 2026)

Grading:
  Homework (6 assignments) — 30%
  Quizzes (4 quizzes) — 10%
  Midterm Exam — 25%
  Final Project — 20%
  Final Exam — 15%

Schedule:
  Homework 1 due 2026-02-07 (5%)
  Homework 2 due 2026-02-21 (5%)
  Quiz 1: Feb 14, 2026 (2.5%)
  Homework 3 due 2026-03-07 (5%)
  Quiz 2: Mar 7, 2026 (2.5%)
  Midterm Exam: March 18, 2026 (25%)
  Homework 4 due 2026-03-28 (5%)
  Quiz 3: Apr 4, 2026 (2.5%)
  Homework 5 due 2026-04-11 (5%)
  Quiz 4: Apr 18, 2026 (2.5%)
  Homework 6 due 2026-04-25 (5%)
  Final Project due May 2, 2026 (20%)
  Final Exam: May 9, 2026 (15%)`,
  },
  "MATH 251": {
    name: "MATH 251",
    text: `MATH 251 — Calculus II (Spring 2026)

Grading: HW 25%, Labs 15%, Exams 35%, Final 25%

HW A due 2026-01-30
Lab 1 due 2026-02-06
HW B due 2026-02-13
Quiz 1 due 2026-02-20
Exam 1 due 2026-02-27
Lab 2 due Feb 13, 2026
HW C due 2026-03-06
Lab 3 due 2026-03-20
Exam 2 due 2026-04-03
HW D due 2026-04-10
Final Presentation due Apr 24, 2026
Final Exam: May 8, 2026`,
  },
};

export default function UploadForm({ onUploadText, onUploadPDF, onAddTask, loading, courseNames }) {
  const [tab, setTab] = useState("text");
  const [courseName, setCourseName] = useState("");
  const [text, setText] = useState("");
  const [example, setExample] = useState("");
  const [pdfCourse, setPdfCourse] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
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

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (f) {
      setPdfFile(f);
      if (!pdfCourse) setPdfCourse(f.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " "));
    }
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

  return (
    <div className="card">
      <div className="upload-tabs">
        <button className={`tab-btn${tab === "text" ? " active" : ""}`} onClick={() => setTab("text")}>
          Paste Text
        </button>
        <button className={`tab-btn${tab === "pdf" ? " active" : ""}`} onClick={() => setTab("pdf")}>
          Upload PDF
        </button>
        <button className={`tab-btn${tab === "manual" ? " active" : ""}`} onClick={() => setTab("manual")}>
          Add Task
        </button>
      </div>

      {tab === "text" && (
        <div className="tab-body">
          <div className="split">
            <input
              placeholder="Course name (e.g., CS 201)"
              value={courseName}
              onChange={e => setCourseName(e.target.value)}
            />
            <select value={example} onChange={e => loadExample(e.target.value)}>
              <option value="">Load example…</option>
              {Object.keys(EXAMPLES).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <textarea
            placeholder="Paste your full syllabus here. AI will extract all assignments, exams, and due dates automatically."
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button disabled={!courseName || !text || loading} onClick={() => onUploadText(courseName, text)}>
              {loading ? <span className="loading-text"><span className="spinner" /> Parsing with AI…</span> : "Generate Schedule"}
            </button>
            <button className="btn-ghost" onClick={() => { setText(""); setCourseName(""); setExample(""); }} disabled={loading}>
              Clear
            </button>
          </div>
          <small className="hint">AI reads real syllabi — paste yours and it will extract all graded items and weights.</small>
        </div>
      )}

      {tab === "pdf" && (
        <div className="tab-body">
          <input
            placeholder="Course name (e.g., BIO 110)"
            value={pdfCourse}
            onChange={e => setPdfCourse(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <div
            className={`drop-zone${pdfFile ? " has-file" : ""}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f?.type === "application/pdf") {
                setPdfFile(f);
                if (!pdfCourse) setPdfCourse(f.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " "));
              }
            }}
          >
            <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handleFileChange} />
            {pdfFile ? <span>📄 {pdfFile.name}</span> : <span>Click or drag & drop a PDF syllabus</span>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button disabled={!pdfCourse || !pdfFile || loading} onClick={() => onUploadPDF(pdfCourse, pdfFile)}>
              {loading ? <span className="loading-text"><span className="spinner" /> Parsing PDF…</span> : "Parse PDF"}
            </button>
            {pdfFile && (
              <button className="btn-ghost" onClick={() => { setPdfFile(null); setPdfCourse(""); }} disabled={loading}>
                Clear
              </button>
            )}
          </div>
          <small className="hint">Extracts text from your PDF, then AI parses it for graded items.</small>
        </div>
      )}

      {tab === "manual" && (
        <form className="tab-body manual-form" onSubmit={submitManual}>
          <div className="split">
            <select value={manualCourse} onChange={e => setManualCourse(e.target.value)} required>
              <option value="">Select course…</option>
              {courseNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select value={manualType} onChange={e => setManualType(e.target.value)}>
              {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <input
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
