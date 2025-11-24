import React, { useMemo } from "react";

function completionForCourse(course) {
  const total = course.items.length;
  const done = course.items.filter(i => i.completed).length;
  const pct = total === 0 ? 0 : Math.round(done / total * 100);
  return { total, done, pct };
}

export default function CourseDashboard({ courses, selectedCourse, onSelectCourse }) {
  const cards = useMemo(() => courses.map(c => {
    const { total, done, pct } = completionForCourse(c);
    const upcoming = c.items.filter(i => !i.completed).slice(0,3);
    return { ...c, total, done, pct, upcoming };
  }), [courses]);

  return (
    <div className="card">
      <h3>Courses</h3>
      <div className="course-list">
        {cards.map(c => (
          <button
            key={c.name}
            className="course-card"
            style={{textAlign:"left", background: c.name === selectedCourse ? "#f1f5f9" : "white"}}
            onClick={() => onSelectCourse(c.name)}
          >
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <strong>{c.name}</strong>
              <span className="pill">{c.done}/{c.total}</span>
            </div>
            <div className="progress"><div style={{width:`${c.pct}%`}} /></div>
            <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
              {c.upcoming.map(u => (
                <span key={u.id} className="pill">{u.title.slice(0,28)}</span>
              ))}
              {c.upcoming.length === 0 && (
                <span className="pill green">All caught up</span>
              )}
            </div>
          </button>
        ))}
        {cards.length === 0 && (
          <div style={{color:"#64748b"}}>No courses yet.</div>
        )}
      </div>
    </div>
  );
}