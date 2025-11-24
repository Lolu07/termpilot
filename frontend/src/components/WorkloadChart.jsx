import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

function nextWeeks(n=8) {
  const start = new Date();
  start.setHours(0,0,0,0);
  const arr = [];
  for (let i=0; i<n; i++) {
    const wStart = new Date(start);
    wStart.setDate(start.getDate() + i*7);
    const wEnd = new Date(wStart);
    wEnd.setDate(wStart.getDate() + 6);
    arr.push({ wStart, wEnd });
  }
  return arr;
}

export default function WorkloadChart({ items }) {
  const data = useMemo(() => {
    const weeks = nextWeeks(8);
    return weeks.map((w, idx) => {
      const effort = items
        .filter(it => {
          const d = new Date(it.due_date);
          return d >= w.wStart && d <= w.wEnd && !it.completed;
        })
        .reduce((s,it)=>s + (it.estimated_effort_hours||0), 0);
      return {
        week: `W${idx+1}`,
        effort: Math.round(effort*10)/10
      };
    });
  }, [items]);

  return (
    <div className="card">
      <h3>Workload Next 8 Weeks (hours)</h3>
      <div style={{width:"100%", height:220}}>
        <ResponsiveContainer>
          <BarChart data={data}>
            <XAxis dataKey="week" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="effort" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <small style={{color:"#64748b"}}>Based on estimated effort per task.</small>
    </div>
  );
}