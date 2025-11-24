const BASE = "https://term-pilot.onrender.com/";


export async function getCourses() {
  const r = await fetch(`${BASE}/courses`);
  return r.json();
}

export async function createCourseFromText(courseName, text) {
  const r = await fetch(`${BASE}/courses/from-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseName, text })
  });
  if (!r.ok) throw new Error("Failed to parse syllabus");
  return r.json();
}

export async function markComplete(itemId) {
  const r = await fetch(`${BASE}/items/${itemId}/complete`, { method: "PATCH" });
  if (!r.ok) throw new Error("Failed to update item");
  return r.json();
}

export async function resetDB() {
  await fetch(`${BASE}/reset`, { method: "POST" });
}
