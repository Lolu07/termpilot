import React, { useState } from "react";

export default function UploadForm({ onUpload, loading }) {
  const [courseName, setCourseName] = useState("");
  const [text, setText] = useState("");
  const [example, setExample] = useState("");

  const examples = {
    "CS 201": `CS 201 Syllabus (Spring 2025)
Homework 1 due 2025-02-10
Quiz 1 due 02/14/2025
Project Proposal due Mar 1, 2025
Midterm Exam: 03/18/2025
Final Exam: May 8, 2025`,
    "MATH 251": `MATH 251 Calc II
HW A due 2025-01-28
Lab 2 due Feb 12, 2025
Quiz 2 due 2/20/25
Exam 1 due 2025-02-25
Final Presentation due Apr 29, 2025`
  };

  function loadExample(name) {
    setExample(name);
    setCourseName(name);
    setText(examples[name]);
  }

  return (
    <div className="card">
      <h3>Upload / Paste Syllabus</h3>
      <div className="split">
        <input
          placeholder="Course name (e.g., CS 201)"
          value={courseName}
          onChange={e => setCourseName(e.target.value)}
        />
        <select value={example} onChange={e => loadExample(e.target.value)}>
          <option value="">Load example…</option>
          {Object.keys(examples).map(k => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>

      <textarea
        placeholder="Paste syllabus text here. Put one task per line with a date."
        value={text}
        onChange={e => setText(e.target.value)}
        style={{marginTop:8}}
      />

      <div style={{display:"flex", gap:8, marginTop:8}}>
        <button
          disabled={!courseName || !text || loading}
          onClick={() => onUpload(courseName, text)}
        >
          {loading ? "Parsing..." : "Generate Schedule"}
        </button>
        <button
          className="secondary"
          onClick={() => { setText(""); setCourseName(""); setExample(""); }}
          disabled={loading}
        >
          Clear
        </button>
      </div>

      <small style={{display:"block", marginTop:8, color:"#64748b"}}>
        Tip: lines like “Homework 3 due 03/18/2025” are enough for the MVP parser.
      </small>
    </div>
  );
}