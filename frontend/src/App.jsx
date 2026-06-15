import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createCourseFromText,
  createCourseFromPDF,
  getCourses,
  markComplete,
  deleteItem as apiDeleteItem,
  deleteCourse as apiDeleteCourse,
  createItem as apiCreateItem,
  resetDB,
} from "./api.js";
import CourseDashboard from "./components/CourseDashboard.jsx";
import UploadForm from "./components/UploadForm.jsx";
import TodayFocus from "./components/TodayFocus.jsx";
import WeekCalendar from "./components/WeekCalendar.jsx";
import WorkloadChart from "./components/WorkloadChart.jsx";

// ── Toast system ──────────────────────────────────────────────────────────────
let _toastId = 0;
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "info") => {
    const id = ++_toastId;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);
  return { toasts, toast: add };
}

function ToastContainer({ toasts }) {
  if (!toasts.length) return null;
  const icons = { success: "✓", error: "✕", info: "ℹ" };
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span style={{ fontWeight: 700 }}>{icons[t.type]}</span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ── Priority label helper ─────────────────────────────────────────────────────
function priorityLabel(score) {
  if (score >= 220) return ["Critical", "red"];
  if (score >= 140) return ["Important", "orange"];
  return ["Low", "green"];
}

export default function App() {
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("tp-dark") === "1"; } catch { return false; }
  });
  const { toasts, toast } = useToasts();

  // Sync dark mode class to <body>
  useEffect(() => {
    document.body.classList.toggle("dark", dark);
    try { localStorage.setItem("tp-dark", dark ? "1" : "0"); } catch {}
  }, [dark]);

  async function refresh() {
    const data = await getCourses();
    setCourses(data);
  }

  useEffect(() => {
    refresh();
    if (!selectedCourse) {
      getCourses().then(data => { if (data.length) setSelectedCourse(data[0].name); });
    }
  }, []);

  const allItems = useMemo(
    () => courses.flatMap(c => c.items.map(i => ({ ...i, courseName: c.name }))),
    [courses]
  );

  const selectedItems = useMemo(() => {
    const c = courses.find(x => x.name === selectedCourse);
    return c ? c.items : [];
  }, [courses, selectedCourse]);

  const courseNames = useMemo(() => courses.map(c => c.name), [courses]);

  async function handleUploadText(courseName, text) {
    setLoading(true);
    try {
      const result = await createCourseFromText(courseName, text);
      await refresh();
      setSelectedCourse(courseName);
      toast(`Parsed ${result.items.length} items for ${courseName}`, "success");
    } catch (e) {
      toast(e.message || "Failed to parse syllabus", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadPDF(courseName, file) {
    setLoading(true);
    try {
      const result = await createCourseFromPDF(courseName, file);
      await refresh();
      setSelectedCourse(courseName);
      toast(`Parsed ${result.items.length} items from PDF`, "success");
    } catch (e) {
      toast(e.message || "Failed to parse PDF", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddTask(fields) {
    try {
      await apiCreateItem(fields);
      await refresh();
      toast(`Added "${fields.title}"`, "success");
    } catch (e) {
      toast(e.message || "Failed to add task", "error");
    }
  }

  async function handleComplete(id) {
    await markComplete(id);
    await refresh();
    toast("Marked as done!", "success");
  }

  async function handleDeleteItem(id, title) {
    if (!confirm(`Delete "${title}"?`)) return;
    try {
      await apiDeleteItem(id);
      await refresh();
      toast("Task deleted", "info");
    } catch (e) {
      toast(e.message || "Failed to delete", "error");
    }
  }

  async function handleDeleteCourse(name) {
    if (!confirm(`Delete course "${name}" and all its tasks?`)) return;
    try {
      await apiDeleteCourse(name);
      if (selectedCourse === name) setSelectedCourse(null);
      await refresh();
      toast(`Deleted course "${name}"`, "info");
    } catch (e) {
      toast(e.message || "Failed to delete course", "error");
    }
  }

  async function handleReset() {
    if (!confirm("Reset all data? This cannot be undone.")) return;
    await resetDB();
    setCourses([]);
    setSelectedCourse(null);
    toast("Data reset", "info");
  }

  const completedCount = allItems.filter(i => i.completed).length;
  const totalCount = allItems.length;
  const pendingCount = totalCount - completedCount;

  return (
    <div>
      {/* Header */}
      <div className="header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="logo">TermPilot</div>
          <span className="pill accent" style={{ fontSize: 11 }}>AI</span>
        </div>
        <div className="header-actions">
          {totalCount > 0 && (
            <div className="stat-row">
              <div className="pill">
                {completedCount}/{totalCount} done
              </div>
            </div>
          )}
          <button className="dark-toggle" onClick={() => setDark(d => !d)} title="Toggle dark mode">
            {dark ? "☀" : "☾"}
          </button>
          <button className="btn-ghost" onClick={handleReset}>
            Reset
          </button>
        </div>
      </div>

      <div className="container grid">
        {/* Left column */}
        <div style={{ display: "grid", gap: 12 }}>
          <UploadForm
            onUploadText={handleUploadText}
            onUploadPDF={handleUploadPDF}
            onAddTask={handleAddTask}
            loading={loading}
            courseNames={courseNames}
          />
          <CourseDashboard
            courses={courses}
            selectedCourse={selectedCourse}
            onSelectCourse={setSelectedCourse}
            onDeleteCourse={handleDeleteCourse}
          />
          <TodayFocus items={allItems} onComplete={handleComplete} />
        </div>

        {/* Right column */}
        <div style={{ display: "grid", gap: 12 }}>
          <WeekCalendar items={allItems} />
          <WorkloadChart items={allItems} />

          {selectedCourse && (
            <div className="card">
              <div className="section-header">
                <h3>{selectedCourse} — Tasks ({selectedItems.length})</h3>
              </div>
              <div className="items">
                {selectedItems
                  .slice()
                  .sort((a, b) => {
                    if (a.completed !== b.completed) return a.completed ? 1 : -1;
                    return a.due_date.localeCompare(b.due_date);
                  })
                  .map(item => {
                    const [label, color] = priorityLabel(item.priority_score);
                    return (
                      <div key={item.id} className={`item-row${item.completed ? " completed" : ""}`}>
                        <div>
                          <div className="item-title">{item.title}</div>
                          <small>{item.item_type} · {item.weight}% weight</small>
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{item.due_date}</div>
                          <small>due date</small>
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{item.estimated_effort_hours}h</div>
                          <small>effort</small>
                        </div>
                        <div>
                          <span className={`pill ${color}`}>{label}</span>
                        </div>
                        <div className="item-actions">
                          {item.completed ? (
                            <span className="pill green">Done</span>
                          ) : (
                            <button onClick={() => handleComplete(item.id)}>Done</button>
                          )}
                          <button
                            className="btn-icon"
                            title="Delete task"
                            onClick={() => handleDeleteItem(item.id, item.title)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                {selectedItems.length === 0 && (
                  <div style={{ color: "var(--text-subtle)", padding: "8px 0" }}>
                    No tasks yet. Upload a syllabus or add one manually.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="footer">
        TermPilot — AI-powered syllabus-to-schedule planner
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  );
}
