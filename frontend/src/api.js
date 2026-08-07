const CONFIGURED_BASE = import.meta.env?.VITE_API_URL?.trim().replace(/\/$/, "") || "";

export const isApiConfigured = Boolean(CONFIGURED_BASE);

let accessTokenProvider = async () => null;
let unauthorizedHandler = () => {};
let apiBase = CONFIGURED_BASE;

export class ApiError extends Error {
  constructor(message, { status, code, issues } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = Array.isArray(issues) ? issues : [];
  }
}

export function configureApiAuth({ getAccessToken, onUnauthorized, baseUrl } = {}) {
  accessTokenProvider = typeof getAccessToken === "function" ? getAccessToken : async () => null;
  unauthorizedHandler = typeof onUnauthorized === "function" ? onUnauthorized : () => {};
  apiBase = typeof baseUrl === "string" ? baseUrl.trim().replace(/\/$/, "") : CONFIGURED_BASE;
}

function notifyUnauthorized(error) {
  Promise.resolve()
    .then(() => unauthorizedHandler(error))
    .catch(() => {});
}

async function authorizedFetch(path, options = {}) {
  if (!apiBase) {
    throw new ApiError("The backend API URL is not configured for this deployment.", {
      code: "CONFIGURATION_ERROR",
    });
  }

  let token;
  try {
    token = await accessTokenProvider();
  } catch {
    const error = new ApiError("TermPilot could not verify your session. Please sign in again.", {
      status: 401,
      code: "AUTH_INVALID",
    });
    notifyUnauthorized(error);
    throw error;
  }

  if (!token) {
    const error = new ApiError("Your session has expired. Please sign in again.", {
      status: 401,
      code: "AUTH_REQUIRED",
    });
    notifyUnauthorized(error);
    throw error;
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${apiBase}${path}`, { ...options, headers });

  if (response.status === 401) {
    notifyUnauthorized(new ApiError("Your session has expired. Please sign in again.", {
      status: 401,
      code: "AUTH_INVALID",
    }));
  }

  return response;
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
  const r = await authorizedFetch("/courses");
  return readResponse(r, "Failed to load courses");
}

export async function bootstrapDemoWorkspace() {
  const r = await authorizedFetch("/demo/bootstrap", { method: "POST" });
  return readResponse(r, "Failed to prepare the live demo");
}

export async function resetDemoWorkspace() {
  const r = await authorizedFetch("/demo/reset", { method: "POST" });
  return readResponse(r, "Failed to reset the live demo");
}

export async function previewSyllabusText(courseName, text) {
  const r = await authorizedFetch("/parse/text", {
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
  const r = await authorizedFetch("/parse/pdf", { method: "POST", body: form });
  return readResponse(r, "Failed to analyze PDF");
}

export async function importReviewedCourse(courseName, items, parseInfo, replace = false) {
  const r = await authorizedFetch("/courses/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseName, items, parseInfo, replace }),
  });
  return readResponse(r, "Failed to import reviewed tasks");
}

export async function deleteCourse(courseId) {
  const r = await authorizedFetch(`/courses/${encodeURIComponent(courseId)}`, { method: "DELETE" });
  return readResponse(r, "Failed to delete course");
}

export async function createItem(fields) {
  const r = await authorizedFetch("/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  return readResponse(r, "Failed to create item");
}

export async function updateItem(id, updates) {
  const r = await authorizedFetch(`/items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return readResponse(r, "Failed to update item");
}

export async function markComplete(itemId) {
  const r = await authorizedFetch(`/items/${encodeURIComponent(itemId)}/complete`, { method: "PATCH" });
  return readResponse(r, "Failed to update item");
}

export async function deleteItem(id) {
  const r = await authorizedFetch(`/items/${encodeURIComponent(id)}`, { method: "DELETE" });
  return readResponse(r, "Failed to delete item");
}

export async function deleteAccountData() {
  const r = await authorizedFetch("/account/data", { method: "DELETE" });
  return readResponse(r, "Failed to clear workspace data");
}
