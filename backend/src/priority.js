/**
 * Score uses:
 *  - days until due (closer => higher)
 *  - weight (higher => higher)
 *  - effort (bigger => higher)
 */
export function priorityScore(item) {
  const daysLeft = daysUntilDue(item.due_date);

  const timeUrgency = daysLeft < 0
    ? 180 + Math.min(Math.abs(daysLeft), 14) * 5
    : 150 / (daysLeft + 1);
  const weightBoost = (item.weight || 0) * 2; // 0-200
  const effortBoost = (item.estimated_effort_hours || 0) * 5; // 0-50

  return Math.round(timeUrgency + weightBoost + effortBoost);
}

export function daysUntilDue(dateKey, now = new Date()) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 365;
  const due = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

export function priorityLabel(score) {
  if (score >= 220) return "Critical";
  if (score >= 140) return "Important";
  return "Low";
}
