const BASE = import.meta.env?.VITE_API_URL || "https://term-pilot.onrender.com/api";

export class ApiError extends Error {
  constructor(message, { status, code, issues } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = Array.isArray(issues) ? issues : [];
  }
}

export async function readResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";
  let payload = null;
  if (contentType.includes("application/json")) {
    try { payload = await response.json(); } catch { payload = null; }
  }

  if (!response.ok) {
    throw new ApiError(payload?.error || fallbackMessage, {
      status: response.status,
      code: payload?.code,
      issues: payload?.issues,
    });
  }
  return payload;
}

export async function getCourses() {
  const r = await fetch(`${BASE}/courses`);
  return readResponse(r, "Failed to load courses");
}

export async function previewSyllabusText(courseName, text) {
  const r = await fetch(`${BASE}/parse/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseName, text }),
  });
  return readResponse(r, "Failed to analyze syllabus");
}

export async function previewSyllabusPDF(courseName, file) {
  const form = new FormData();
  form.append("courseName", courseName);
  form.append("file", file);
  const r = await fetch(`${BASE}/parse/pdf`, { method: "POST", body: form });
  return readResponse(r, "Failed to analyze PDF");
}

export async function importReviewedCourse(courseName, items, parseInfo, replace = false) {
  const r = await fetch(`${BASE}/courses/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseName, items, parseInfo, replace }),
  });
  return readResponse(r, "Failed to import reviewed tasks");
}

export async function deleteCourse(courseName) {
  const r = await fetch(`${BASE}/courses/${encodeURIComponent(courseName)}`, { method: "DELETE" });
  return readResponse(r, "Failed to delete course");
}

export async function createItem(fields) {
  const r = await fetch(`${BASE}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  return readResponse(r, "Failed to create item");
}

export async function updateItem(id, updates) {
  const r = await fetch(`${BASE}/items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return readResponse(r, "Failed to update item");
}

export async function markComplete(itemId) {
  const r = await fetch(`${BASE}/items/${itemId}/complete`, { method: "PATCH" });
  return readResponse(r, "Failed to update item");
}

export async function deleteItem(id) {
  const r = await fetch(`${BASE}/items/${id}`, { method: "DELETE" });
  return readResponse(r, "Failed to delete item");
}

export async function resetDB() {
  const r = await fetch(`${BASE}/reset`, { method: "POST" });
  return readResponse(r, "Failed to reset data");
}
