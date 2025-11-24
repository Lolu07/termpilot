import React, { useMemo } from "react";

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0 sun
  const diff = (day + 6) % 7; // monday start
  date.setDate(date.getDate() - diff);
  date.setHours(0,0,0,0);
  return date;
}

export default function WeekCalendar({ items }) {
  const weekDays = useMemo(() => {
    const start = startOfWeek(new Date());
    return Array.from({length:7}, (_,i) => {
      const dd = new Date(start);
      dd.setDate(start.getDate() + i);
      return dd;
    });
  }, []);

  const byDate = useMemo(() => {
    const map = {};
    items.forEach(it => {
      (map[it.due_date] ||= []).push(it);
    });
    return map;
  }, [items]);

  return (
    <div className="card">
      <h3>This Week</h3>
      <div className="calendar">
        {weekDays.map(d => {
          const key = d.toISOString().slice(0,10);
          const dayItems = (byDate[key] || []).slice(0,4);
          return (
            <div className="day" key={key}>
              <div className="date">
                {d.toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" })}
              </div>
              {dayItems.map(it => (
                <div key={it.id} className="task-dot">
                  {it.courseName}: {it.title.slice(0,20)}
                </div>
              ))}
              {dayItems.length === 0 && (
                <div className="task-dot" style={{opacity:0.5}}>—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}