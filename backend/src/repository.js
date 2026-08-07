import { priorityScore } from "./priority.js";

const ITEM_COLUMNS = [
  "id",
  "course_id",
  "item_type",
  "title",
  "due_date",
  "estimated_effort_hours",
  "weight",
  "completed",
  "created_at",
  "updated_at",
].join(",");

const COURSE_COLUMNS = `
  id,
  name,
  parse_info,
  created_at,
  updated_at,
  items (${ITEM_COLUMNS})
`;

export class RepositoryError extends Error {
  constructor(message, { status = 500, code = "PERSISTENCE_ERROR", cause } = {}) {
    super(message, { cause });
    this.name = "RepositoryError";
    this.status = status;
    this.code = code;
  }
}

function throwDataError(error, fallbackMessage) {
  if (!error) return;
  if (error.code === "23505") {
    throw new RepositoryError("A record with those values already exists.", {
      status: 409,
      code: "DUPLICATE_RECORD",
      cause: error,
    });
  }
  if (["22023", "22P02", "23502", "23503", "23514"].includes(error.code)) {
    throw new RepositoryError("The database rejected one or more fields.", {
      status: 400,
      code: "VALIDATION_ERROR",
      cause: error,
    });
  }
  throw new RepositoryError(fallbackMessage, { cause: error });
}

function isCourseNameConflict(error) {
  if (error?.code !== "23505") return false;
  const details = `${error.message || ""} ${error.details || ""}`;
  return details.includes("A course with this name already exists")
    || details.includes("Set p_replace_existing to true")
    || details.includes("courses_user_name_unique");
}

export function serializeItem(row, score = priorityScore) {
  const item = {
    id: row.id,
    course_id: row.course_id,
    item_type: row.item_type,
    title: row.title,
    due_date: row.due_date,
    estimated_effort_hours: Number(row.estimated_effort_hours),
    weight: Number(row.weight),
    completed: Boolean(row.completed),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  item.priority_score = score(item);
  return item;
}

export function serializeCourse(row, score = priorityScore) {
  const items = Array.isArray(row.items)
    ? row.items.map(item => serializeItem(item, score)).sort((left, right) => (
      left.due_date.localeCompare(right.due_date)
      || left.title.localeCompare(right.title)
    ))
    : [];

  return {
    id: row.id,
    name: row.name,
    parse_info: row.parse_info || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
    items,
  };
}

export function createSupabaseRepository({ priorityScoreFn = priorityScore } = {}) {
  async function getCourseById(client, userId, courseId) {
    const { data, error } = await client
      .from("courses")
      .select(COURSE_COLUMNS)
      .eq("id", courseId)
      .eq("user_id", userId)
      .maybeSingle();
    throwDataError(error, "Failed to load the course.");
    return data ? serializeCourse(data, priorityScoreFn) : null;
  }

  return {
    async listCourses(client, userId) {
      const { data, error } = await client
        .from("courses")
        .select(COURSE_COLUMNS)
        .eq("user_id", userId)
        .order("name", { ascending: true });
      throwDataError(error, "Failed to load courses.");
      return (data || []).map(course => serializeCourse(course, priorityScoreFn));
    },

    getCourseById,

    async importReviewedCourse(client, userId, {
      courseName,
      items,
      parseInfo,
      replace,
    }) {
      const { data, error } = await client.rpc("import_reviewed_course", {
        p_course_name: courseName,
        p_items: items,
        p_parse_info: parseInfo,
        p_replace_existing: replace,
      });

      if (isCourseNameConflict(error)) {
        throw new RepositoryError(
          `A course named "${courseName}" already exists. Confirm replacement to continue.`,
          { status: 409, code: "COURSE_EXISTS", cause: error },
        );
      }
      throwDataError(error, "Failed to import the reviewed course.");

      const course = await getCourseById(client, userId, data?.course_id);
      if (!course) {
        throw new RepositoryError("The course was saved but could not be reloaded.");
      }
      return {
        course,
        created: data?.created === true,
        replaced: data?.replaced === true,
        importId: data?.import_id,
      };
    },

    async deleteCourse(client, userId, courseId) {
      const { data, error } = await client
        .from("courses")
        .delete()
        .eq("id", courseId)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();
      throwDataError(error, "Failed to delete the course.");
      return Boolean(data);
    },

    async createItem(client, userId, fields) {
      const { data: course, error: courseError } = await client
        .from("courses")
        .select("id")
        .eq("id", fields.course_id)
        .eq("user_id", userId)
        .maybeSingle();
      throwDataError(courseError, "Failed to verify the course.");
      if (!course) return null;

      const { data, error } = await client
        .from("items")
        .insert({
          course_id: fields.course_id,
          user_id: userId,
          title: fields.title,
          due_date: fields.due_date,
          item_type: fields.item_type,
          weight: fields.weight,
          estimated_effort_hours: fields.estimated_effort_hours,
          completed: false,
        })
        .select(ITEM_COLUMNS)
        .single();
      if (error?.code === "23503") return null;
      throwDataError(error, "Failed to create the task.");
      return serializeItem(data, priorityScoreFn);
    },

    async updateItem(client, userId, itemId, updates) {
      const { data, error } = await client
        .from("items")
        .update(updates)
        .eq("id", itemId)
        .eq("user_id", userId)
        .select(ITEM_COLUMNS)
        .maybeSingle();
      throwDataError(error, "Failed to update the task.");
      return data ? serializeItem(data, priorityScoreFn) : null;
    },

    async deleteItem(client, userId, itemId) {
      const { data, error } = await client
        .from("items")
        .delete()
        .eq("id", itemId)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();
      throwDataError(error, "Failed to delete the task.");
      return Boolean(data);
    },

    async deleteOwnData(client, userId) {
      const { error } = await client
        .from("courses")
        .delete()
        .eq("user_id", userId);
      throwDataError(error, "Failed to delete your TermPilot data.");
      return true;
    },
  };
}
