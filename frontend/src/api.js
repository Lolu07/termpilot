const BASE = import.meta.env.VITE_API_URL || "https://term-pilot.onrender.com/api";

export async function getCourses() {
  const r = await fetch(`${BASE}/courses`);
  return r.json();
}

export async function createCourseFromText(courseName, text) {
  const r = await fetch(`${BASE}/courses/from-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseName, text }),
  });
  if (!r.ok) throw new Error("Failed to parse syllabus");
  return r.json();
}

export async function createCourseFromPDF(courseName, file) {
  const form = new FormData();
  form.append("courseName", courseName);
  form.append("file", file);
  const r = await fetch(`${BASE}/courses/from-pdf`, { method: "POST", body: form });
  if (!r.ok) throw new Error("Failed to parse PDF");
  return r.json();
}

export async function deleteCourse(courseName) {
  const r = await fetch(`${BASE}/courses/${encodeURIComponent(courseName)}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Failed to delete course");
  return r.json();
}

export async function createItem(fields) {
  const r = await fetch(`${BASE}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!r.ok) throw new Error("Failed to create item");
  return r.json();
}

export async function updateItem(id, updates) {
  const r = await fetch(`${BASE}/items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!r.ok) throw new Error("Failed to update item");
  return r.json();
}

export async function markComplete(itemId) {
  const r = await fetch(`${BASE}/items/${itemId}/complete`, { method: "PATCH" });
  if (!r.ok) throw new Error("Failed to update item");
  return r.json();
}

export async function deleteItem(id) {
  const r = await fetch(`${BASE}/items/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Failed to delete item");
  return r.json();
}

export async function resetDB() {
  await fetch(`${BASE}/reset`, { method: "POST" });
}
