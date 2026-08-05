import React, { useEffect, useMemo, useRef, useState } from "react";
import { REVIEW_ITEM_TYPES, validateReviewDraft } from "../reviewValidation.js";
import { CloseIcon, TrashIcon } from "./Icons.jsx";

function newReviewItem() {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: "",
    item_type: "Task",
    due_date: "",
    weight: 0,
    estimated_effort_hours: 2,
  };
}

export default function ReviewImport({ draft, existingCourses, conflictCourseName, saving, onCancel, onConfirm }) {
  const [courseName, setCourseName] = useState(draft.courseName);
  const [items, setItems] = useState(() => draft.items.map(item => ({ ...item })));
  const headingRef = useRef(null);
  const dialogRef = useRef(null);
  const cancelRef = useRef(onCancel);
  const savingRef = useRef(saving);
  cancelRef.current = onCancel;
  savingRef.current = saving;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    const backdrop = dialogRef.current?.parentElement;
    const backgroundNodes = backdrop?.parentElement
      ? [...backdrop.parentElement.children].filter(node => node !== backdrop)
      : [];
    const previousInert = backgroundNodes.map(node => node.inert);
    backgroundNodes.forEach(node => { node.inert = true; });
    document.body.style.overflow = "hidden";
    headingRef.current?.focus();
    const onKeyDown = event => {
      if (event.key === "Escape" && !savingRef.current) cancelRef.current();
      if (event.key !== "Tab") return;

      const focusable = [...dialogRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]',
      )].filter(element => !element.hasAttribute("hidden"));
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      backgroundNodes.forEach((node, index) => { node.inert = previousInert[index]; });
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  const issues = useMemo(() => validateReviewDraft(courseName, items), [courseName, items]);
  const courseNameIssue = issues.find(issue => issue.path === "courseName");
  const invalidRows = useMemo(() => new Set(
    issues
      .map(issue => issue.path.match(/^items\[(\d+)\]/)?.[1])
      .filter(value => value !== undefined)
      .map(Number),
  ), [issues]);
  const missingWeightCount = useMemo(() => items.filter(item => Number(item.weight) === 0).length, [items]);
  const weightTotal = useMemo(
    () => Math.round(items.reduce((total, item) => total + (Number(item.weight) || 0), 0) * 10) / 10,
    [items],
  );
  const existingCourse = useMemo(
    () => existingCourses.find(course => course.name.toLowerCase() === courseName.trim().toLowerCase())
      || (conflictCourseName?.toLowerCase() === courseName.trim().toLowerCase() ? { name: courseName.trim() } : null),
    [conflictCourseName, courseName, existingCourses],
  );
  const canImport = issues.length === 0 && !saving;

  function updateItem(id, field, value) {
    setItems(current => current.map(item => item.id === id ? { ...item, [field]: value } : item));
  }

  function removeItem(id) {
    const removedIndex = items.findIndex(item => item.id === id);
    setItems(current => current.filter(item => item.id !== id));
    requestAnimationFrame(() => {
      const rows = [...dialogRef.current.querySelectorAll(".review-row")];
      const targetRow = rows[Math.min(removedIndex, rows.length - 1)];
      (targetRow?.querySelector("input") || dialogRef.current.querySelector(".add-review-item"))?.focus();
    });
  }

  return (
    <div className="review-backdrop">
      <section ref={dialogRef} className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title" aria-describedby="review-description" tabIndex={-1}>
        <header className="review-header">
          <div>
            <div className="eyebrow">Import checkpoint</div>
            <h2 id="review-title" ref={headingRef} tabIndex={-1}>Review before takeoff</h2>
            <p id="review-description">{draft.parse_info?.engine === "groq" ? "AI" : "TermPilot"} found the deadlines below. Correct anything that looks off, then add the course to your plan.</p>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} disabled={saving} aria-label="Close review">
            <CloseIcon />
          </button>
        </header>

        <div className="review-meta">
          <label className="course-name-field">
            <span>Course name</span>
            <input value={courseName} onChange={event => setCourseName(event.target.value)} maxLength={100} disabled={saving} aria-invalid={Boolean(courseNameIssue)} aria-describedby={courseNameIssue ? "course-name-error" : undefined} />
            {courseNameIssue && <small className="field-error" id="course-name-error">{courseNameIssue.message}</small>}
          </label>
          <div className="review-facts" aria-label="Parse summary">
            <span><strong>{items.length}</strong> deadlines</span>
            <span><strong>{draft.parse_info?.engine === "groq" ? "AI" : "Fallback"}</strong> parser</span>
            {draft.parse_info?.pages && <span><strong>{draft.parse_info.pages}</strong> pages</span>}
            <span><strong>{weightTotal}%</strong> total weight</span>
            <span><strong>{missingWeightCount}</strong> weights unlisted</span>
          </div>
        </div>

        <div className="review-warnings">
          {draft.parse_info?.engine !== "groq" && (
            <div className="review-warning" role="status">
              <span className="warning-mark">!</span>
              The AI provider was unavailable, so TermPilot used its deterministic fallback parser. Verify each date before importing.
            </div>
          )}

          {existingCourse && (
            <div className="review-warning" role="status">
              <span className="warning-mark">!</span>
              Importing will replace every current task for <strong>{existingCourse.name}</strong> and reset its completion history. Nothing changes until you confirm below.
            </div>
          )}
        </div>

        <div className="review-table-wrap">
          <div className="review-grid review-grid-head" aria-hidden="true">
            <span>Task</span><span>Type</span><span>Due date</span><span>Weight</span><span>Effort</span><span />
          </div>
          <div className="review-rows">
            {items.map((item, index) => {
              const valid = !invalidRows.has(index);
              const itemPath = `items[${index}]`;
              const rowIssues = issues.filter(issue => issue.path.startsWith(itemPath));
              const fieldInvalid = field => rowIssues.some(issue => issue.path === `${itemPath}.${field}`);
              const rowMessages = [...new Set(rowIssues.map(issue => issue.message))];
              const rowErrorId = `review-row-${index}-errors`;
              return (
                <div className={`review-grid review-row${valid ? "" : " invalid"}`} key={item.id}>
                  <label className="review-title-field">
                    <span className="mobile-field-label">Task {index + 1}</span>
                    <input
                      value={item.title}
                      onChange={event => updateItem(item.id, "title", event.target.value)}
                      aria-label={`Task ${index + 1} title`}
                      aria-invalid={fieldInvalid("title")}
                      aria-describedby={fieldInvalid("title") ? rowErrorId : undefined}
                      disabled={saving}
                      placeholder="Task title"
                    />
                  </label>
                  <label>
                    <span className="mobile-field-label">Type</span>
                    <select value={item.item_type} onChange={event => updateItem(item.id, "item_type", event.target.value)} aria-label={`Task ${index + 1} type`} aria-invalid={fieldInvalid("item_type")} aria-describedby={fieldInvalid("item_type") ? rowErrorId : undefined} disabled={saving}>
                      {REVIEW_ITEM_TYPES.map(type => <option key={type}>{type}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="mobile-field-label">Due date</span>
                    <input type="date" value={item.due_date} onChange={event => updateItem(item.id, "due_date", event.target.value)} aria-label={`Task ${index + 1} due date`} aria-invalid={fieldInvalid("due_date")} aria-describedby={fieldInvalid("due_date") ? rowErrorId : undefined} disabled={saving} />
                  </label>
                  <label>
                    <span className="mobile-field-label">Weight</span>
                    <div className="input-suffix">
                      <input type="number" min="0" max="100" step="0.5" value={item.weight} onChange={event => updateItem(item.id, "weight", event.target.value)} aria-label={`Task ${index + 1} weight`} aria-invalid={fieldInvalid("weight")} aria-describedby={fieldInvalid("weight") ? rowErrorId : undefined} disabled={saving} />
                      <span>%</span>
                    </div>
                  </label>
                  <label>
                    <span className="mobile-field-label">Effort</span>
                    <div className="input-suffix">
                      <input type="number" min="0.5" max="80" step="0.5" value={item.estimated_effort_hours} onChange={event => updateItem(item.id, "estimated_effort_hours", event.target.value)} aria-label={`Task ${index + 1} effort hours`} aria-invalid={fieldInvalid("estimated_effort_hours")} aria-describedby={fieldInvalid("estimated_effort_hours") ? rowErrorId : undefined} disabled={saving} />
                      <span>h</span>
                    </div>
                  </label>
                  <button className="remove-review-item" type="button" onClick={() => removeItem(item.id)} disabled={saving} aria-label={`Remove ${item.title || `task ${index + 1}`}`}><TrashIcon size={16} /></button>
                  {rowMessages.length > 0 && (
                    <div className="review-row-errors" id={rowErrorId} role="alert">{rowMessages.join(" ")}</div>
                  )}
                </div>
              );
            })}
          </div>
          {items.length === 0 && (
            <div className="review-empty">No deadlines remain. Add a task to continue.</div>
          )}
        </div>

        <footer className="review-footer">
          <div className="review-footer-note">
            {issues.length > 0
              ? `${issues.length} ${issues.length === 1 ? "issue needs" : "issues need"} attention before import.`
              : "Looks good. Nothing is saved until you confirm this import."}
          </div>
          <div className="review-actions">
            <button className="button-secondary add-review-item" type="button" onClick={() => setItems(current => [...current, newReviewItem()])} disabled={saving}>+ Add task</button>
            <button className="button-secondary" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
            <button
              className="button-primary"
              type="button"
              disabled={!canImport}
              onClick={() => onConfirm({ courseName: courseName.trim(), items, parseInfo: draft.parse_info, replace: Boolean(existingCourse) })}
            >
              {saving ? "Importing…" : existingCourse ? `Replace with ${items.length} tasks` : `Import ${items.length} tasks`}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
