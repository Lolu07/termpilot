import React, { useMemo } from "react";
import { daysFromToday, formatFriendlyDate } from "../dateUtils.js";

function label(score) {
  if (score >= 220) return ["Critical", "red"];
  if (score >= 140) return ["Important", "orange"];
  return ["Low", "green"];
}

export default function TodayFocus({ items, onComplete }) {
  const focus = useMemo(() => {
    return items
      .filter(i => !i.completed)
      .sort((a, b) => b.priority_score - a.priority_score)
      .slice(0, 6);
  }, [items]);

  return (
    <div className="card">
      <h3>Today's Focus</h3>
      <div className="items">
        {focus.map(it => {
          const [text, color] = label(it.priority_score);
          const dueIn = daysFromToday(it.due_date);
          const dueLabel = dueIn === null ? "date unavailable" : dueIn < 0
            ? `${Math.abs(dueIn)}d overdue`
            : dueIn === 0 ? "due today!" : `${dueIn}d left`;
          return (
            <div key={it.id} className="item-row focus-row">
              <div>
                <div className="item-title">{it.title}</div>
                <small>{it.courseName} · {it.item_type}</small>
              </div>
              <div>
                <time className="item-date" dateTime={it.due_date}>{formatFriendlyDate(it.due_date)}</time>
                <small className={dueIn !== null && dueIn < 0 ? "overdue-text" : ""}>{dueLabel}</small>
              </div>
              <div>
                <span className={`pill ${color}`}>{text}</span>
              </div>
              <div>
                <button onClick={() => onComplete(it.id)}>Done</button>
              </div>
            </div>
          );
        })}
        {focus.length === 0 && (
          <div style={{ color: "var(--text-subtle)", padding: "4px 0" }}>
            Nothing urgent right now. Nice!
          </div>
        )}
      </div>
    </div>
  );
}
