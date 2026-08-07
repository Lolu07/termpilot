function normalizeUserId(userId) {
  return typeof userId === "string" && userId.trim() ? userId.trim() : null;
}

export function createUserScope(initialUserId = null) {
  let userId = normalizeUserId(initialUserId);
  let generation = 0;

  return {
    transition(nextUserId) {
      const normalizedNextUserId = normalizeUserId(nextUserId);
      const previousUserId = userId;
      const changed = previousUserId !== normalizedNextUserId;
      if (changed) {
        userId = normalizedNextUserId;
        generation += 1;
      }
      return { changed, previousUserId, userId, generation };
    },

    capture() {
      return { userId, generation };
    },

    isCurrent(requestScope) {
      return Boolean(
        requestScope?.userId
        && requestScope.userId === userId
        && requestScope.generation === generation
      );
    },
  };
}
