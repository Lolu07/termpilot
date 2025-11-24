/**
 * Simple explainable priority heuristic.
 * Score uses:
 *  - days until due (closer => higher)
 *  - weight (higher => higher)
 *  - effort (bigger => higher)
 */
export function priorityScore(item) {
  const today = new Date();
  const due = new Date(item.due_date);
  const daysLeft = Math.max(0, Math.ceil((due - today) / (1000*60*60*24)));

  const timeUrgency = daysLeft === 0 ? 100 : (30 / (daysLeft + 1)) * 10; // 0-300-ish
  const weightBoost = (item.weight || 0) * 2; // 0-200
  const effortBoost = (item.estimated_effort_hours || 0) * 5; // 0-50

  return Math.round(timeUrgency + weightBoost + effortBoost);
}

export function priorityLabel(score) {
  if (score >= 220) return "Critical";
  if (score >= 140) return "Important";
  return "Low";
}