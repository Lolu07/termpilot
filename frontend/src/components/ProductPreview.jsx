import React from "react";

// A miniature of the real dashboard, shown on the landing page so visitors see
// the product before they sign in. Decorative: the surrounding copy already
// states everything here, so it stays out of the accessibility tree.

const WEEKS = [
  { label: "Sep 8", hours: 4 },
  { label: "Sep 22", hours: 6 },
  { label: "Oct 3", hours: 9 },
  { label: "Oct 21", hours: 14 },
  { label: "Oct 31", hours: 8 },
  { label: "Nov 11", hours: 5 },
  { label: "Nov 21", hours: 11 },
  { label: "Dec 9", hours: 7 },
];

const TASKS = [
  { title: "Midterm Exam", type: "Exam", due: "Oct 21", weight: "20%", tone: "danger" },
  { title: "System Design Document", type: "Project", due: "Oct 31", weight: "10%", tone: "warning" },
  { title: "CI/CD Pipeline Setup", type: "Lab", due: "Nov 11", weight: "4%", tone: "normal" },
];

const PEAK_HOURS = Math.max(...WEEKS.map(week => week.hours));

export default function ProductPreview() {
  return (
    <div className="preview" aria-hidden="true">
      <div className="preview-card">
        <div className="preview-head">
          <div className="preview-course">
            <span className="preview-mark">CS</span>
            <div>
              <strong>CS 3450 · Software Engineering</strong>
              <small>17 deadlines · Fall 2026</small>
            </div>
          </div>
          <span className="preview-badge">AI parsed</span>
        </div>

        <div className="preview-chart">
          <div className="preview-chart-head">
            <span>Weekly workload</span>
            <span>{PEAK_HOURS}h peak</span>
          </div>
          <div className="preview-bars">
            {WEEKS.map((week, index) => (
              <div
                key={week.label}
                className={`preview-bar${week.hours === PEAK_HOURS ? " peak" : ""}`}
                style={{
                  "--bar-height": `${Math.round((week.hours / PEAK_HOURS) * 100)}%`,
                  "--bar-delay": `${320 + index * 60}ms`,
                }}
              >
                <i />
              </div>
            ))}
          </div>
        </div>

        <ul className="preview-tasks">
          {TASKS.map((task, index) => (
            <li
              key={task.title}
              className={`preview-task tone-${task.tone}`}
              style={{
                "--row-delay": `${820 + index * 90}ms`,
                "--scan-delay": `${1500 + index * 2400}ms`,
              }}
            >
              <span className="preview-task-dot" />
              <div className="preview-task-body">
                <strong>{task.title}</strong>
                <small>{task.type}</small>
              </div>
              <span className="preview-task-due">{task.due}</span>
              <span className="preview-task-weight">{task.weight}</span>
            </li>
          ))}
        </ul>

        <div className="preview-foot">
          <div className="preview-progress"><i /></div>
          <span>68% of the term mapped</span>
        </div>
      </div>
    </div>
  );
}
