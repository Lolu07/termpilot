import React, { useMemo } from "react";
import { TrashIcon } from "./Icons.jsx";

function completionForCourse(course) {
  const total = course.items.length;
  const done = course.items.filter(i => i.completed).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, pct };
}

export default function CourseDashboard({ courses, selectedCourseId, onSelectCourse, onDeleteCourse }) {
  const cards = useMemo(() => courses.map(c => {
    const { total, done, pct } = completionForCourse(c);
    const upcoming = c.items
      .filter(i => !i.completed)
      .slice()
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 3);
    return { ...c, total, done, pct, upcoming };
  }), [courses]);

  return (
    <div className="card">
      <h3>Courses ({cards.length})</h3>
      <div className="course-list">
        {cards.map(c => (
          <div
            key={c.id}
            className={`course-card${c.id === selectedCourseId ? " selected" : ""}`}
          >
            <button
              className="course-card-main"
              type="button"
              onClick={() => onSelectCourse(c.id)}
              aria-pressed={c.id === selectedCourseId}
            >
              <div className="course-card-header">
                <span className="course-name">{c.name}</span>
                <div className="course-badges">
                  <span className="pill">{c.done}/{c.total}</span>
                  {c.parse_info && (
                    <span className="pill accent" title={`${c.parse_info.item_count} items extracted`}>
                      {c.parse_info.demo_seed
                        ? "Demo"
                        : c.parse_info.engine === "groq" ? "AI" : "Fallback"}
                    </span>
                  )}
                </div>
              </div>
              <div className="progress" aria-label={`${c.pct}% complete`}>
                <div style={{ width: `${c.pct}%` }} />
              </div>
              <div className="upcoming-chips">
                {c.upcoming.map(u => (
                  <span key={u.id} className="pill">{u.title.slice(0, 26)}</span>
                ))}
                {c.upcoming.length === 0 && (
                  <span className="pill green">All caught up</span>
                )}
              </div>
            </button>
            <button
              className="course-delete btn-icon"
              type="button"
              title="Delete course"
              aria-label={`Delete ${c.name}`}
              onClick={() => onDeleteCourse(c.id, c.name)}
            >
              <TrashIcon size={16} />
            </button>
          </div>
        ))}
        {cards.length === 0 && (
          <div style={{ color: "var(--text-subtle)", padding: "4px 0" }}>
            No courses yet. Upload a syllabus to get started.
          </div>
        )}
      </div>
    </div>
  );
}
