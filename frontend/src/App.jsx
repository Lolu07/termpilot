import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import {
  getCourses,
  importReviewedCourse,
  markComplete,
  deleteItem as apiDeleteItem,
  deleteCourse as apiDeleteCourse,
  previewSyllabusPDF,
  previewSyllabusText,
  createItem as apiCreateItem,
  resetDB,
} from "./api.js";
import CourseDashboard from "./components/CourseDashboard.jsx";
import UploadForm from "./components/UploadForm.jsx";
import TodayFocus from "./components/TodayFocus.jsx";
import WeekCalendar from "./components/WeekCalendar.jsx";
import ReviewImport from "./components/ReviewImport.jsx";
import OverviewHero from "./components/OverviewHero.jsx";
import EmptyWorkspace from "./components/EmptyWorkspace.jsx";
import { formatFriendlyDate } from "./dateUtils.js";
import { ArrowUpRightIcon, MoonIcon, SunIcon, TrashIcon } from "./components/Icons.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";

const WorkloadChart = lazy(() => import("./components/WorkloadChart.jsx"));

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
    <div className="toast-container" role="status" aria-live="polite">
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
  const [reviewDraft, setReviewDraft] = useState(null);
  const [reviewConflictCourse, setReviewConflictCourse] = useState(null);
  const [savingReview, setSavingReview] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [confirming, setConfirming] = useState(false);
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
    return data;
  }

  useEffect(() => {
    getCourses()
      .then(data => {
        setCourses(data);
        if (data.length) setSelectedCourse(data[0].name);
      })
      .catch(error => toast(error.message || "Failed to load courses", "error"));
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
      const result = await previewSyllabusText(courseName, text);
      setReviewConflictCourse(null);
      setReviewDraft(result);
      const engine = result.parse_info?.engine === "groq" ? "AI" : "fallback parser";
      toast(`Found ${result.items.length} items with ${engine}. Review them before importing.`, "info");
    } catch (e) {
      toast(e.message || "Failed to parse syllabus", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadPDF(courseName, file) {
    setLoading(true);
    try {
      const result = await previewSyllabusPDF(courseName, file);
      setReviewConflictCourse(null);
      setReviewDraft(result);
      const engine = result.parse_info?.engine === "groq" ? "AI" : "fallback parser";
      const pages = result.parse_info?.pages ? ` across ${result.parse_info.pages} page${result.parse_info.pages === 1 ? "" : "s"}` : "";
      toast(`Found ${result.items.length} items${pages} with ${engine}. Review them before importing.`, "info");
    } catch (e) {
      toast(e.message || "Failed to parse PDF", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmImport({ courseName, items, parseInfo, replace }) {
    setSavingReview(true);
    try {
      const course = await importReviewedCourse(courseName, items, parseInfo, replace);
      setCourses(current => {
        const next = current.filter(existing => existing.name.toLowerCase() !== course.name.toLowerCase());
        return [...next, course];
      });
      setSelectedCourse(course.name);
      setReviewDraft(null);
      setReviewConflictCourse(null);
      toast(`Added ${course.items.length} reviewed tasks to ${course.name}`, "success");
      try {
        await refresh();
      } catch {
        toast("The course was saved, but the dashboard could not refresh. Reload the page to sync it.", "info");
      }
    } catch (error) {
      if (error.code === "COURSE_EXISTS") {
        setReviewConflictCourse(courseName);
        toast("That course now exists. Review the replacement warning, then confirm again.", "info");
        return;
      }
      toast(error.message || "Failed to import reviewed tasks", "error");
    } finally {
      setSavingReview(false);
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
    try {
      await markComplete(id);
      await refresh();
      toast("Marked as done!", "success");
    } catch (e) {
      toast(e.message || "Failed to update task", "error");
    }
  }

  function handleDeleteItem(id, title) {
    setConfirmation({
      kind: "delete-item",
      id,
      title: "Delete this task?",
      description: `“${title}” will be permanently removed from this course.`,
      confirmLabel: "Delete task",
    });
  }

  function handleDeleteCourse(name) {
    setConfirmation({
      kind: "delete-course",
      name,
      title: `Delete ${name}?`,
      description: "Every task and completion record in this course will be permanently removed.",
      confirmLabel: "Delete course",
    });
  }

  function handleReset() {
    setConfirmation({
      kind: "reset",
      title: "Reset the demo workspace?",
      description: "This permanently removes every course and task from the current demo data store.",
      confirmLabel: "Reset workspace",
    });
  }

  async function handleConfirmAction() {
    if (!confirmation) return;
    setConfirming(true);
    try {
      if (confirmation.kind === "delete-item") {
        await apiDeleteItem(confirmation.id);
        setCourses(current => current.map(course => ({
          ...course,
          items: course.items.filter(item => item.id !== confirmation.id),
        })));
        toast("Task deleted", "info");
        try { await refresh(); } catch { toast("Task deleted. Reload the page to fully sync the dashboard.", "info"); }
      } else if (confirmation.kind === "delete-course") {
        await apiDeleteCourse(confirmation.name);
        setCourses(current => current.filter(course => course.name !== confirmation.name));
        if (selectedCourse === confirmation.name) setSelectedCourse(null);
        toast(`Deleted course "${confirmation.name}"`, "info");
        try { await refresh(); } catch { toast("Course deleted. Reload the page to fully sync the dashboard.", "info"); }
      } else if (confirmation.kind === "reset") {
        await resetDB();
        setCourses([]);
        setSelectedCourse(null);
        toast("Demo workspace reset", "info");
      }
    } catch (e) {
      toast(e.message || "The action could not be completed", "error");
    } finally {
      setConfirming(false);
      setConfirmation(null);
    }
  }

  const completedCount = allItems.filter(i => i.completed).length;
  const totalCount = allItems.length;
  const pendingCount = totalCount - completedCount;

  return (
    <div className="app-frame">
      {/* Header */}
      <div className="header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><ArrowUpRightIcon size={21} /></div>
          <div>
            <div className="logo">TermPilot</div>
            <div className="logo-sub">Plan the term. Fly the plan.</div>
          </div>
        </div>
        <div className="header-actions">
          {totalCount > 0 && (
            <div className="stat-row">
              <div className="pill">
                {completedCount}/{totalCount} done
              </div>
            </div>
          )}
          <button className="dark-toggle" onClick={() => setDark(d => !d)} title="Toggle dark mode" aria-label="Toggle dark mode">
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          <a className="header-link" href="https://github.com/Lolu07/termpilot" target="_blank" rel="noreferrer">View source <ArrowUpRightIcon size={14} /></a>
        </div>
      </div>

      <main className="container">
        <OverviewHero items={allItems} courseCount={courses.length} />
        <div className="grid">
        {/* Left column */}
        <aside className="sidebar-stack">
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
        </aside>

        {/* Right column */}
        <section className="dashboard-stack">
          {courses.length > 0 ? (
            <>
              <TodayFocus items={allItems} onComplete={handleComplete} />
              <WeekCalendar items={allItems} />
              <Suspense fallback={<div className="card chart-loading" aria-label="Loading workload forecast"><span className="spinner" /> Loading forecast…</div>}>
                <WorkloadChart items={allItems} />
              </Suspense>
            </>
          ) : (
            <EmptyWorkspace />
          )}

          {selectedCourse && (
            <div className="card">
              <div className="section-header">
                <h3>{selectedCourse} — Tasks ({selectedItems.length})</h3>
                {courses.find(course => course.name === selectedCourse)?.parse_info && (
                  <span className="pill accent">
                    {courses.find(course => course.name === selectedCourse).parse_info.engine === "groq" ? "AI parsed" : "Fallback parsed"}
                  </span>
                )}
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
                          <small>{item.item_type} · {item.weight > 0 ? `${item.weight}% weight` : "weight not listed"}</small>
                        </div>
                        <div>
                          <time className="item-date" dateTime={item.due_date}>{formatFriendlyDate(item.due_date)}</time>
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
                            aria-label={`Delete ${item.title}`}
                            onClick={() => handleDeleteItem(item.id, item.title)}
                          >
                            <TrashIcon size={16} />
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
        </section>
        </div>
      </main>

      <div className="footer">
        <span><strong>TermPilot</strong> — built to make every deadline visible.</span>
        {courses.length > 0 && <button type="button" onClick={handleReset}>Reset demo data</button>}
      </div>

      <ToastContainer toasts={toasts} />

      {reviewDraft && (
        <ReviewImport
          draft={reviewDraft}
          existingCourses={courses}
          conflictCourseName={reviewConflictCourse}
          saving={savingReview}
          onCancel={() => { setReviewDraft(null); setReviewConflictCourse(null); }}
          onConfirm={handleConfirmImport}
        />
      )}

      {confirmation && (
        <ConfirmDialog
          title={confirmation.title}
          description={confirmation.description}
          confirmLabel={confirmation.confirmLabel}
          busy={confirming}
          onCancel={() => setConfirmation(null)}
          onConfirm={handleConfirmAction}
        />
      )}
    </div>
  );
}
