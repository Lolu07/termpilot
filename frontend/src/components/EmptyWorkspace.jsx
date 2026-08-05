import React from "react";
import { ArrowUpRightIcon } from "./Icons.jsx";

const capabilities = [
  {
    number: "01",
    title: "Readable extraction",
    copy: "PDF layout is reconstructed before AI analysis, so table-based syllabi keep their dates and weights aligned.",
  },
  {
    number: "02",
    title: "Human verification",
    copy: "Every detected deadline enters an editable checkpoint. Nothing is saved until you approve the result.",
  },
  {
    number: "03",
    title: "Priority, not clutter",
    copy: "TermPilot combines urgency, course weight, and effort to surface the work that deserves attention first.",
  },
];

export default function EmptyWorkspace() {
  return (
    <section className="card empty-workspace" aria-labelledby="empty-workspace-title">
      <div className="empty-workspace-intro">
        <div>
          <div className="eyebrow">Built for real syllabi</div>
          <h2 id="empty-workspace-title">A calmer first look at the entire term.</h2>
          <p>Start with the example in Paste Text or upload a text-based PDF. You will review the extraction before a single deadline reaches the dashboard.</p>
        </div>
        <a className="empty-cta" href="#syllabus-import">Start an import <ArrowUpRightIcon size={15} /></a>
      </div>
      <div className="capability-list">
        {capabilities.map(capability => (
          <article key={capability.number}>
            <span>{capability.number}</span>
            <div>
              <h3>{capability.title}</h3>
              <p>{capability.copy}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="empty-proof">
        <span>10 MB PDF limit</span>
        <span>Editable review</span>
        <span>Deterministic fallback</span>
        <span>Raw document text is not stored</span>
      </div>
    </section>
  );
}
