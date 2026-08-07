const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function startOfUtcDay(value) {
  const date = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("now must be a valid date");
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dateAfter(referenceDate, days) {
  return new Date(referenceDate.getTime() + days * DAY_IN_MILLISECONDS)
    .toISOString()
    .slice(0, 10);
}

function course(courseName, items) {
  return {
    courseName,
    items,
    parseInfo: {
      engine: "fallback",
      input_type: "text",
      item_count: items.length,
      reviewed: true,
      demo_seed: true,
    },
    replace: false,
  };
}

/**
 * Builds a small, current-looking workspace for anonymous demo sessions.
 * Dates are derived from the supplied reference time so the priority and
 * workload views remain useful instead of aging into an overdue fixture.
 */
export function buildDemoCourses({ now } = {}) {
  const today = startOfUtcDay(now);

  return [
    course("CS 301 — Data Structures", [
      {
        title: "Problem Set 3 — Hash Tables",
        due_date: dateAfter(today, 3),
        item_type: "Homework",
        weight: 6,
        estimated_effort_hours: 4,
      },
      {
        title: "Quiz 2 — Trees & Traversals",
        due_date: dateAfter(today, 7),
        item_type: "Quiz",
        weight: 5,
        estimated_effort_hours: 1,
      },
      {
        title: "Programming Project — Route Planner",
        due_date: dateAfter(today, 14),
        item_type: "Project",
        weight: 15,
        estimated_effort_hours: 10,
      },
      {
        title: "Midterm Exam",
        due_date: dateAfter(today, 23),
        item_type: "Midterm",
        weight: 25,
        estimated_effort_hours: 6,
      },
      {
        title: "Lab 5 — Graph Algorithms",
        due_date: dateAfter(today, 35),
        item_type: "Lab",
        weight: 5,
        estimated_effort_hours: 3,
      },
    ]),
    course("DES 210 — Human-Centered Design", [
      {
        title: "Interview Research Plan",
        due_date: dateAfter(today, 5),
        item_type: "Project",
        weight: 10,
        estimated_effort_hours: 3,
      },
      {
        title: "Usability Test Protocol",
        due_date: dateAfter(today, 11),
        item_type: "Lab",
        weight: 10,
        estimated_effort_hours: 4,
      },
      {
        title: "Prototype Critique",
        due_date: dateAfter(today, 19),
        item_type: "Presentation",
        weight: 10,
        estimated_effort_hours: 3,
      },
      {
        title: "Final Product Case Study",
        due_date: dateAfter(today, 49),
        item_type: "Final",
        weight: 30,
        estimated_effort_hours: 12,
      },
    ]),
  ];
}
