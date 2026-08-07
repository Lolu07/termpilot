import React from "react";

export default function DemoBanner({ onReset, onExit, resetting = false }) {
  return (
    <aside className="demo-banner" aria-labelledby="demo-banner-title">
      <div className="demo-banner-content">
        <span className="pill accent">LIVE DEMO</span>
        <div className="demo-banner-copy">
          <strong id="demo-banner-title">You’re exploring the complete TermPilot experience.</strong>
          <span>
            This temporary workspace is private to your demo session. Import a syllabus,
            review extracted deadlines, test priority planning, and complete tasks freely.
          </span>
        </div>
      </div>

      <div className="demo-banner-actions">
        <button
          className="button-secondary"
          type="button"
          onClick={onReset}
          disabled={resetting}
        >
          {resetting ? "Resetting…" : "Reset demo"}
        </button>
        <button className="btn-ghost" type="button" onClick={onExit} disabled={resetting}>
          Exit demo
        </button>
      </div>
    </aside>
  );
}
