import React, { useMemo } from "react";

function completionForCourse(course) {
  const total = course.items.length;
  const done = course.items.filter(i => i.completed).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, pct };
}

export default function CourseDashboard({ courses, selectedCourse, onSelectCourse, onDeleteCourse }) {
  const cards = useMemo(() => courses.map(c => {
    const { total, done, pct } = completionForCourse(c);
    const upcoming = c.items.filter(i => !i.completed).slice(0, 3);
    return { ...c, total, done, pct, upcoming };
  }), [courses]);

  return (
    <div className="card">
      <h3>Courses ({cards.length})</h3>
      <div className="course-list">
        {cards.map(c => (
          <div
            key={c.name}
            className={`course-card${c.name === selectedCourse ? " selected" : ""}`}
            onClick={() => onSelectCourse(c.name)}
          >
            <div className="course-card-header">
              <span className="course-name">{c.name}</span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span className="pill">{c.done}/{c.total}</span>
                <div className="course-actions" onClick={e => e.stopPropagation()}>
                  <button
                    className="btn-icon"
                    title="Delete course"
                    onClick={() => onDeleteCourse(c.name)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
            <div className="progress">
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
