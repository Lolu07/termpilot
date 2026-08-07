/**
 * Priority is intentionally due-date first. Each urgency window has enough
 * separation that weight and effort can only order tasks inside that window;
 * a distant exam can never displace an assignment due this week.
 */
export function priorityScore(item, now = new Date()) {
  const daysLeft = daysUntilDue(item.due_date, now);
  const weight = clampNumber(item.weight, 0, 100);
  const effort = clampNumber(item.estimated_effort_hours, 0, 20);
  const impactTieBreak = weight * 0.3 + effort;

  let urgency;
  if (daysLeft < 0) urgency = 700 + Math.min(Math.abs(daysLeft), 30);
  else if (daysLeft === 0) urgency = 650;
  else if (daysLeft <= 3) urgency = 550 + (3 - daysLeft) * 10;
  else if (daysLeft <= 7) urgency = 450 + (7 - daysLeft) * 5;
  else if (daysLeft <= 14) urgency = 350 + (14 - daysLeft) * 3;
  else if (daysLeft <= 30) urgency = 250 + (30 - daysLeft);
  else urgency = 100 + Math.max(0, 90 - Math.min(daysLeft, 90)) * 0.5;

  return Math.round(urgency + impactTieBreak);
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

export function daysUntilDue(dateKey, now = new Date()) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 365;
  const due = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

export function priorityLabel(score) {
  if (score >= 650) return "Critical";
  if (score >= 550) return "High";
  if (score >= 450) return "Soon";
  if (score >= 350) return "Upcoming";
  return "Planned";
}
