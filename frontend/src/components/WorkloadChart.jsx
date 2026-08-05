import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { parseDateKey } from "../dateUtils.js";

function nextWeeks(n = 8) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const arr = [];
  for (let i = 0; i < n; i++) {
    const wStart = new Date(start);
    wStart.setDate(start.getDate() + i * 7);
    const wEnd = new Date(wStart);
    wEnd.setDate(wStart.getDate() + 6);
    arr.push({ wStart, wEnd });
  }
  return arr;
}

const ACCENT = "var(--chart-normal)";
const WARN = "var(--chart-warning)";
const DANGER = "var(--chart-danger)";

export default function WorkloadChart({ items }) {
  const data = useMemo(() => {
    const weeks = nextWeeks(8);
    return weeks.map((w, idx) => {
      const effort = items
        .filter(it => {
          const d = parseDateKey(it.due_date);
          if (!d) return false;
          return d >= w.wStart && d <= w.wEnd && !it.completed;
        })
        .reduce((s, it) => s + (it.estimated_effort_hours || 0), 0);
      return {
        week: w.wStart.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        effort: Math.round(effort * 10) / 10,
      };
    });
  }, [items]);

  return (
    <div className="card">
      <h3>Workload — Next 8 Weeks</h3>
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <BarChart data={data} barCategoryGap="30%">
            <XAxis dataKey="week" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} unit="h" width={32} />
            <Tooltip
              formatter={(v) => [`${v}h`, "Effort"]}
              contentStyle={{ borderRadius: 8, fontSize: 13 }}
            />
            <Bar dataKey="effort" radius={[6, 6, 0, 0]}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.effort >= 20 ? DANGER : d.effort >= 12 ? WARN : ACCENT}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <small style={{ color: "var(--text-subtle)" }}>
        Hours of pending work due each week. Red = high load.
      </small>
    </div>
  );
}
