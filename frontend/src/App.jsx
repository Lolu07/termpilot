import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  configureApiAuth,
  getCourses,
  importReviewedCourse,
  markComplete,
  deleteItem as apiDeleteItem,
  deleteCourse as apiDeleteCourse,
  previewSyllabusPDF,
  previewSyllabusText,
  createItem as apiCreateItem,
  deleteAccountData,
  isApiConfigured,
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
import AuthScreen, { AuthLoadingScreen } from "./components/AuthScreen.jsx";
import { getMagicLinkRedirectUrl, getSupabaseClient, isSupabaseConfigured } from "./auth/supabase.js";
import { createUserScope } from "./auth/userScope.js";

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
  const clear = useCallback(() => setToasts([]), []);
  return { toasts, toast: add, clearToasts: clear };
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
  if (score >= 650) return ["Critical", "red"];
  if (score >= 550) return ["High", "orange"];
  if (score >= 450) return ["Soon", "orange"];
  if (score >= 350) return ["Upcoming", "accent"];
  return ["Planned", "green"];
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reviewDraft, setReviewDraft] = useState(null);
  const [reviewConflictCourse, setReviewConflictCourse] = useState(null);
  const [savingReview, setSavingReview] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("tp-dark") === "1"; } catch { return false; }
  });
  const { toasts, toast, clearToasts } = useToasts();
  const userScopeRef = useRef(null);
  if (!userScopeRef.current) userScopeRef.current = createUserScope();

  // Sync dark mode class to <body>
  useEffect(() => {
    document.body.classList.toggle("dark", dark);
    try { localStorage.setItem("tp-dark", dark ? "1" : "0"); } catch {}
  }, [dark]);

  const clearWorkspaceState = useCallback(() => {
    setCourses([]);
    setSelectedCourseId(null);
    setLoading(false);
    setReviewDraft(null);
    setReviewConflictCourse(null);
    setSavingReview(false);
    setConfirmation(null);
    setConfirming(false);
    clearToasts();
  }, [clearToasts]);

  const applySession = useCallback(nextSession => {
    const nextUserId = nextSession?.user?.id || null;
    const transition = userScopeRef.current.transition(nextUserId);
    if (transition.changed) {
      clearWorkspaceState();
      setWorkspaceLoading(Boolean(nextUserId));
    }
    setSession(nextSession);
  }, [clearWorkspaceState]);

  const syncCourses = useCallback(data => {
    const nextCourses = Array.isArray(data) ? data : [];
    setCourses(nextCourses);
    setSelectedCourseId(current => (
      nextCourses.some(course => course.id === current) ? current : nextCourses[0]?.id || null
    ));
  }, []);

  const refresh = useCallback(async () => {
    const requestScope = userScopeRef.current.capture();
    if (!requestScope.userId) return null;
    const data = await getCourses();
    if (!userScopeRef.current.isCurrent(requestScope)) return null;
    syncCourses(data);
    return data;
  }, [syncCourses]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthReady(true);
      return undefined;
    }

    const supabase = getSupabaseClient();
    let active = true;
    let handlingUnauthorized = false;

    configureApiAuth({
      getAccessToken: async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        return data.session?.access_token || null;
      },
      onUnauthorized: async () => {
        if (handlingUnauthorized) return;
        handlingUnauthorized = true;
        if (active) setAuthNotice("Your session expired. Request a new sign-in link to continue.");
        try {
          await supabase.auth.signOut({ scope: "local" });
        } finally {
          if (active) {
            applySession(null);
          }
          handlingUnauthorized = false;
        }
      },
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      applySession(nextSession);
      setAuthReady(true);
      if (nextSession) setAuthNotice("");
    });

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setAuthNotice("We could not restore your session. Request a new sign-in link to continue.");
          applySession(null);
        } else {
          applySession(data.session);
        }
      })
      .catch(() => {
        if (active) {
          setAuthNotice("We could not restore your session. Request a new sign-in link to continue.");
          applySession(null);
        }
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
      configureApiAuth();
    };
  }, [applySession]);

  useEffect(() => {
    if (!authReady || !session?.user?.id) return undefined;
    let active = true;
    const requestScope = userScopeRef.current.capture();
    setWorkspaceLoading(true);
    getCourses()
      .then(data => {
        if (active && userScopeRef.current.isCurrent(requestScope)) syncCourses(data);
      })
      .catch(error => {
        if (active && userScopeRef.current.isCurrent(requestScope) && error.status !== 401) {
          toast(error.message || "Failed to load courses", "error");
        }
      })
      .finally(() => {
        if (active && userScopeRef.current.isCurrent(requestScope)) setWorkspaceLoading(false);
      });
    return () => { active = false; };
  }, [authReady, session?.user?.id, syncCourses, toast]);

  const allItems = useMemo(
    () => courses.flatMap(c => c.items.map(i => ({ ...i, courseId: c.id, courseName: c.name }))),
    [courses]
  );

  const selectedCourse = useMemo(
    () => courses.find(course => course.id === selectedCourseId) || null,
    [courses, selectedCourseId],
  );

  const selectedItems = selectedCourse?.items || [];

  const courseOptions = useMemo(() => courses.map(course => ({ id: course.id, name: course.name })), [courses]);

  function captureUserRequest() {
    return userScopeRef.current.capture();
  }

  function isCurrentUserRequest(requestScope) {
    return userScopeRef.current.isCurrent(requestScope);
  }

  async function handleUploadText(courseName, text) {
    const requestScope = captureUserRequest();
    setLoading(true);
    try {
      const result = await previewSyllabusText(courseName, text);
      if (!isCurrentUserRequest(requestScope)) return;
      setReviewConflictCourse(null);
      setReviewDraft(result);
      const engine = result.parse_info?.engine === "groq" ? "AI" : "fallback parser";
      toast(`Found ${result.items.length} items with ${engine}. Review them before importing.`, "info");
    } catch (e) {
      if (isCurrentUserRequest(requestScope)) toast(e.message || "Failed to parse syllabus", "error");
    } finally {
      if (isCurrentUserRequest(requestScope)) setLoading(false);
    }
  }

  async function handleUploadPDF(courseName, file) {
    const requestScope = captureUserRequest();
    setLoading(true);
    try {
      const result = await previewSyllabusPDF(courseName, file);
      if (!isCurrentUserRequest(requestScope)) return;
      setReviewConflictCourse(null);
      setReviewDraft(result);
      const engine = result.parse_info?.engine === "groq" ? "AI" : "fallback parser";
      const pages = result.parse_info?.pages ? ` across ${result.parse_info.pages} page${result.parse_info.pages === 1 ? "" : "s"}` : "";
      toast(`Found ${result.items.length} items${pages} with ${engine}. Review them before importing.`, "info");
    } catch (e) {
      if (isCurrentUserRequest(requestScope)) toast(e.message || "Failed to parse PDF", "error");
    } finally {
      if (isCurrentUserRequest(requestScope)) setLoading(false);
    }
  }

  async function handleConfirmImport({ courseName, items, parseInfo, replace }) {
    const requestScope = captureUserRequest();
    setSavingReview(true);
    try {
      const course = await importReviewedCourse(courseName, items, parseInfo, replace);
      if (!isCurrentUserRequest(requestScope)) return;
      setCourses(current => {
        const next = current.filter(existing => existing.name.toLowerCase() !== course.name.toLowerCase());
        return [...next, course];
      });
      setSelectedCourseId(course.id);
      setReviewDraft(null);
      setReviewConflictCourse(null);
      toast(`Added ${course.items.length} reviewed tasks to ${course.name}`, "success");
      try {
        await refresh();
      } catch {
        if (isCurrentUserRequest(requestScope)) {
          toast("The course was saved, but the dashboard could not refresh. Reload the page to sync it.", "info");
        }
      }
    } catch (error) {
      if (!isCurrentUserRequest(requestScope)) return;
      if (error.code === "COURSE_EXISTS") {
        setReviewConflictCourse(courseName);
        toast("That course now exists. Review the replacement warning, then confirm again.", "info");
        return;
      }
      toast(error.message || "Failed to import reviewed tasks", "error");
    } finally {
      if (isCurrentUserRequest(requestScope)) setSavingReview(false);
    }
  }

  async function handleAddTask(fields) {
    const requestScope = captureUserRequest();
    try {
      await apiCreateItem(fields);
      if (!isCurrentUserRequest(requestScope)) return;
      await refresh();
      if (isCurrentUserRequest(requestScope)) toast(`Added "${fields.title}"`, "success");
    } catch (e) {
      if (isCurrentUserRequest(requestScope)) toast(e.message || "Failed to add task", "error");
    }
  }

  async function handleComplete(id) {
    const requestScope = captureUserRequest();
    try {
      await markComplete(id);
      if (!isCurrentUserRequest(requestScope)) return;
      await refresh();
      if (isCurrentUserRequest(requestScope)) toast("Marked as done!", "success");
    } catch (e) {
      if (isCurrentUserRequest(requestScope)) toast(e.message || "Failed to update task", "error");
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

  function handleDeleteCourse(id, name) {
    setConfirmation({
      kind: "delete-course",
      id,
      name,
      title: `Delete ${name}?`,
      description: "Every task and completion record in this course will be permanently removed.",
      confirmLabel: "Delete course",
    });
  }

  function handleReset() {
    setConfirmation({
      kind: "reset",
      title: "Clear your workspace?",
      description: "This permanently removes every course and task in your account. Other TermPilot accounts are not affected.",
      confirmLabel: "Clear my workspace",
    });
  }

  async function handleConfirmAction() {
    if (!confirmation) return;
    const requestScope = captureUserRequest();
    const pendingConfirmation = confirmation;
    setConfirming(true);
    try {
      if (pendingConfirmation.kind === "delete-item") {
        await apiDeleteItem(pendingConfirmation.id);
        if (!isCurrentUserRequest(requestScope)) return;
        setCourses(current => current.map(course => ({
          ...course,
          items: course.items.filter(item => item.id !== pendingConfirmation.id),
        })));
        toast("Task deleted", "info");
        try { await refresh(); } catch {
          if (isCurrentUserRequest(requestScope)) toast("Task deleted. Reload the page to fully sync the dashboard.", "info");
        }
      } else if (pendingConfirmation.kind === "delete-course") {
        await apiDeleteCourse(pendingConfirmation.id);
        if (!isCurrentUserRequest(requestScope)) return;
        setCourses(current => current.filter(course => course.id !== pendingConfirmation.id));
        if (selectedCourseId === pendingConfirmation.id) setSelectedCourseId(null);
        toast(`Deleted course "${pendingConfirmation.name}"`, "info");
        try { await refresh(); } catch {
          if (isCurrentUserRequest(requestScope)) toast("Course deleted. Reload the page to fully sync the dashboard.", "info");
        }
      } else if (pendingConfirmation.kind === "reset") {
        await deleteAccountData();
        if (!isCurrentUserRequest(requestScope)) return;
        setCourses([]);
        setSelectedCourseId(null);
        toast("Your workspace is clear", "info");
      }
    } catch (e) {
      if (isCurrentUserRequest(requestScope)) toast(e.message || "The action could not be completed", "error");
    } finally {
      if (isCurrentUserRequest(requestScope)) {
        setConfirming(false);
        setConfirmation(null);
      }
    }
  }

  const completedCount = allItems.filter(i => i.completed).length;
  const totalCount = allItems.length;

  async function handleRequestMagicLink(email) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getMagicLinkRedirectUrl(),
        shouldCreateUser: true,
      },
    });
    if (error) throw error;
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
      applySession(null);
      setAuthNotice("You’re signed out. Use a magic link whenever you’re ready to return.");
    } catch (error) {
      toast(error.message || "Could not sign out", "error");
    } finally {
      setSigningOut(false);
    }
  }

  if (!authReady) {
    return <AuthLoadingScreen dark={dark} onToggleDark={() => setDark(value => !value)} />;
  }

  const configurationError = !isSupabaseConfigured
    ? "Authentication is not configured for this deployment yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then redeploy."
    : !isApiConfigured
      ? "The backend API is not configured for this deployment yet. Add VITE_API_URL, then redeploy."
      : "";

  if (!session || configurationError) {
    return (
      <AuthScreen
        dark={dark}
        onToggleDark={() => setDark(value => !value)}
        onRequestLink={handleRequestMagicLink}
        notice={authNotice}
        configurationError={configurationError}
      />
    );
  }

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
          <div className="account-chip" title={session.user.email || "Signed-in account"}>
            <span className="account-avatar" aria-hidden="true">{(session.user.email || "T").charAt(0).toUpperCase()}</span>
            <span className="account-copy">
              <strong>{session.user.email?.split("@")[0] || "Account"}</strong>
              <small>Private workspace</small>
            </span>
            <button className="account-signout" type="button" onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </div>

      <main className="container">
        {workspaceLoading ? (
          <div className="workspace-loading card" aria-live="polite">
            <span className="auth-loader" aria-hidden="true" />
            <div><strong>Loading your workspace</strong><span>Syncing courses and deadlines…</span></div>
          </div>
        ) : (
        <>
        <OverviewHero items={allItems} courseCount={courses.length} />
        <div className="grid">
        {/* Left column */}
        <aside className="sidebar-stack">
          <UploadForm
            onUploadText={handleUploadText}
            onUploadPDF={handleUploadPDF}
            onAddTask={handleAddTask}
            loading={loading}
            courseOptions={courseOptions}
          />
          <CourseDashboard
            courses={courses}
            selectedCourseId={selectedCourseId}
            onSelectCourse={setSelectedCourseId}
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
                <h3>{selectedCourse.name} — Tasks ({selectedItems.length})</h3>
                {selectedCourse.parse_info && (
                  <span className="pill accent">
                    {selectedCourse.parse_info.engine === "groq" ? "AI parsed" : "Fallback parsed"}
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
        </>
        )}
      </main>

      <div className="footer">
        <span><strong>TermPilot</strong> — built to make every deadline visible.</span>
        {courses.length > 0 && <button type="button" onClick={handleReset}>Clear my workspace</button>}
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
