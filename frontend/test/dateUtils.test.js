import assert from "node:assert/strict";
import test from "node:test";

import { daysFromToday, formatDateKey, formatFriendlyDate, parseDateKey } from "../src/dateUtils.js";

test("date utilities preserve local calendar dates", () => {
  const date = new Date(2026, 8, 8, 23, 45);
  assert.equal(formatDateKey(date), "2026-09-08");
  assert.equal(formatDateKey(parseDateKey("2026-09-08")), "2026-09-08");
  assert.equal(daysFromToday("2026-09-07", date), -1);
  assert.equal(daysFromToday("2026-09-08", date), 0);
  assert.equal(daysFromToday("2026-09-10", date), 2);
  assert.equal(formatFriendlyDate("2026-09-08", "en-US"), "Sep 8, 2026");
  assert.equal(formatFriendlyDate("not-a-date", "en-US"), "Date unavailable");
});
