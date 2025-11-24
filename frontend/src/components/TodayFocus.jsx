import React, { useMemo } from "react";

function label(score) {
  if (score >= 220) return ["Critical", "red"];
  if (score >= 140) return ["Important", "orange"];
  return ["Low", "green"];
}

export default function TodayFocus({ items, onComplete }) {
  const today = new Date().toISOString().slice(0,10);

  const focus = useMemo(() => {
    const pending = items.filter(i => !i.completed);
    // tasks due today or next 3 days, sorted by score
    const soon = pending
      .filter(i => i.due_date >= today)
      .sort((a,b) => b.priority_score - a.priority_score)
      .slice(0,6);
    return soon;
  }, [items, today]);

  return (
    <div className="card">
      <h3>Today’s Focus</h3>
      <div className="items">
        {focus.map(it => {
          const [text, color] = label(it.priority_score);
          const dueIn = Math.max(0, Math.ceil((new Date(it.due_date) - new Date())/(1000*60*60*24)));
          return (
            <div key={it.id} className="item-row" style={{gridTemplateColumns:"2fr 1fr 1fr auto"}}>
              <div>
                <div style={{fontWeight:600}}>{it.title}</div>
                <small>{it.courseName} • {it.item_type}</small>
              </div>
              <div>
                <div>{it.due_date}</div>
                <small>{dueIn === 0 ? "due today" : `${dueIn}d left`}</small>
              </div>
              <div>
                <span className={`pill ${color}`}>{text}</span>
              </div>
              <div>
                <button onClick={() => onComplete(it.id)}>Done</button>
              </div>
            </div>
          )
        })}
        {focus.length === 0 && (
          <div style={{color:"#64748b"}}>Nothing urgent. Nice!</div>
        )}
      </div>
    </div>
  );
}