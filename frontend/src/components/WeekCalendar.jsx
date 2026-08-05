import React, { useMemo } from "react";
import { formatDateKey } from "../dateUtils.js";

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day + 6) % 7; // Monday start
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default function WeekCalendar({ items }) {
  const today = formatDateKey(new Date());

  const weekDays = useMemo(() => {
    const start = startOfWeek(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const dd = new Date(start);
      dd.setDate(start.getDate() + i);
      return dd;
    });
  }, []);

  const byDate = useMemo(() => {
    const map = {};
    items.forEach(it => {
      if (!it.completed) (map[it.due_date] ||= []).push(it);
    });
    return map;
  }, [items]);

  return (
    <div className="card">
      <h3>This Week</h3>
      <div className="calendar">
        {weekDays.map(d => {
          const key = formatDateKey(d);
          const allDayItems = byDate[key] || [];
          const dayItems = allDayItems.slice(0, 4);
          const hiddenCount = Math.max(0, allDayItems.length - dayItems.length);
          const isToday = key === today;
          return (
            <div className={`day${isToday ? " today" : ""}`} key={key}>
              <div className="day-date">
                {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
              </div>
              {dayItems.map(it => (
                <div key={it.id} className="task-dot" title={`${it.courseName}: ${it.title}`}>
                  {it.title.slice(0, 18)}
                </div>
              ))}
              {hiddenCount > 0 && (
                <div className="task-more" title={allDayItems.slice(4).map(item => item.title).join(", ")}>+{hiddenCount} more</div>
              )}
              {allDayItems.length === 0 && (
                <div style={{ color: "var(--text-subtle)", fontSize: 11, marginTop: 4 }}>—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
