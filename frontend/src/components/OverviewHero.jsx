import React, { useMemo } from "react";
import { daysFromToday } from "../dateUtils.js";

function dueCopy(days) {
  if (days === null) return "Date unavailable";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

export default function OverviewHero({ items, courseCount }) {
  const summary = useMemo(() => {
    const pending = items.filter(item => !item.completed);
    const ranked = pending
      .map(item => ({ ...item, days: daysFromToday(item.due_date) }))
      .sort((a, b) => {
        if (a.days < 0 && b.days >= 0) return -1;
        if (b.days < 0 && a.days >= 0) return 1;
        return a.due_date.localeCompare(b.due_date);
      });
    return {
      pending: pending.length,
      dueSoon: ranked.filter(item => item.days !== null && item.days >= 0 && item.days <= 7).length,
      overdue: ranked.filter(item => item.days !== null && item.days < 0).length,
      next: ranked[0] || null,
    };
  }, [items]);

  const hasPlan = courseCount > 0;
  return (
    <section className={`overview-hero${hasPlan ? " active-plan" : ""}`}>
      <div className="hero-route" aria-hidden="true"><span /><span /><span /></div>
      <div className="hero-copy">
        <div className="eyebrow">Academic command center</div>
        <h1>{hasPlan ? "Your semester, on one clear flight path." : "Turn syllabus chaos into a clear flight plan."}</h1>
        <p>
          {hasPlan
            ? `${courseCount} ${courseCount === 1 ? "course" : "courses"} mapped. TermPilot keeps the next deadline visible and the workload ahead predictable.`
            : "Import a syllabus, verify the AI extraction, and leave with every deadline prioritized in minutes."}
        </p>
      </div>

      {hasPlan ? (
        <div className="hero-status">
          <div className="next-deadline">
            <span className="status-label">Next signal</span>
            <strong>{summary.next?.title || "All clear"}</strong>
            <span>{summary.next ? `${summary.next.courseName} · ${dueCopy(summary.next.days)}` : "No pending deadlines"}</span>
          </div>
          <div className="hero-metrics">
            <div><strong>{summary.pending}</strong><span>Pending</span></div>
            <div><strong>{summary.dueSoon}</strong><span>Next 7 days</span></div>
            <div className={summary.overdue ? "metric-alert" : ""}><strong>{summary.overdue}</strong><span>Overdue</span></div>
          </div>
        </div>
      ) : (
        <div className="hero-process" aria-label="How TermPilot works">
          <div><span>01</span><strong>Import</strong><small>PDF or text</small></div>
          <div><span>02</span><strong>Review</strong><small>Verify every date</small></div>
          <div><span>03</span><strong>Navigate</strong><small>Focus on what matters</small></div>
        </div>
      )}
    </section>
  );
}
