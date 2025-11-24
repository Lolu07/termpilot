import React, { useEffect, useMemo, useState } from "react";
import { createCourseFromText, getCourses, markComplete, resetDB } from "./api.js";
import CourseDashboard from "./components/CourseDashboard.jsx";
import UploadForm from "./components/UploadForm.jsx";
import TodayFocus from "./components/TodayFocus.jsx";
import WeekCalendar from "./components/WeekCalendar.jsx";
import WorkloadChart from "./components/WorkloadChart.jsx";

export default function App() {
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    const data = await getCourses();
    setCourses(data);
    if (data.length && !selectedCourse) setSelectedCourse(data[0].name);
  }

  useEffect(() => { refresh(); }, []);

  const allItems = useMemo(
    () => courses.flatMap(c => c.items.map(i => ({...i, courseName: c.name}))),
    [courses]
  );

  const selectedItems = useMemo(() => {
    const c = courses.find(x => x.name === selectedCourse);
    return c ? c.items : [];
  }, [courses, selectedCourse]);

  async function handleUpload(courseName, text) {
    setLoading(true);
    try {
      await createCourseFromText(courseName, text);
      await refresh();
      setSelectedCourse(courseName);
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete(id) {
    await markComplete(id);
    await refresh();
  }

  const completedCount = allItems.filter(i => i.completed).length;
  const totalCount = allItems.length;

  return (
    <div>
      <div className="header">
        <div className="logo">TermPilot <span className="badge">MVP</span></div>
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          <div className="pill">{completedCount}/{totalCount} done</div>
          <button className="ghost" onClick={async()=>{await resetDB();await refresh();}}>
            Reset Demo Data
          </button>
        </div>
      </div>

      <div className="container grid">
        <div style={{display:"grid", gap:12}}>
          <UploadForm onUpload={handleUpload} loading={loading} />
          <CourseDashboard
            courses={courses}
            selectedCourse={selectedCourse}
            onSelectCourse={setSelectedCourse}
          />
          <TodayFocus items={allItems} onComplete={handleComplete}/>
        </div>

        <div style={{display:"grid", gap:12}}>
          <WeekCalendar items={allItems}/>
          <WorkloadChart items={allItems}/>
          {selectedCourse && (
            <div className="card">
              <h3>{selectedCourse} – Upcoming Tasks</h3>
              <div className="items">
                {selectedItems.map(item => (
                  <div key={item.id} className="item-row">
                    <div>
                      <div style={{fontWeight:600}}>{item.title}</div>
                      <small>{item.item_type}</small>
                    </div>
                    <div>
                      <div>{item.due_date}</div>
                      <small>due</small>
                    </div>
                    <div>
                      <div>{item.estimated_effort_hours}h</div>
                      <small>effort</small>
                    </div>
                    <div>
                      <div>{item.priority_score}</div>
                      <small>score</small>
                    </div>
                    <div>
                      {item.completed ? (
                        <span className="pill green">Done</span>
                      ) : (
                        <button onClick={() => handleComplete(item.id)}>Mark done</button>
                      )}
                    </div>
                  </div>
                ))}
                {selectedItems.length === 0 && (
                  <div style={{color:"#64748b"}}>No items yet. Upload a syllabus.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="footer">
        TermPilot MVP – paste syllabus text and watch tasks appear.
      </div>
    </div>
  );
}