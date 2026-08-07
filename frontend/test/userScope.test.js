import assert from "node:assert/strict";
import test from "node:test";

import { createUserScope } from "../src/auth/userScope.js";

test("user scope invalidates responses captured for a previous authenticated user", () => {
  const scope = createUserScope();
  assert.equal(scope.transition("user-a").changed, true);
  const userARequest = scope.capture();
  assert.equal(scope.isCurrent(userARequest), true);

  const transition = scope.transition("user-b");
  assert.deepEqual(
    { changed: transition.changed, previousUserId: transition.previousUserId, userId: transition.userId },
    { changed: true, previousUserId: "user-a", userId: "user-b" },
  );
  assert.equal(scope.isCurrent(userARequest), false);
  assert.equal(scope.isCurrent(scope.capture()), true);
});

test("token refreshes keep the same user scope while sign-out invalidates it", () => {
  const scope = createUserScope("user-a");
  const request = scope.capture();

  assert.equal(scope.transition("user-a").changed, false);
  assert.equal(scope.isCurrent(request), true);
  assert.equal(scope.transition(null).changed, true);
  assert.equal(scope.isCurrent(request), false);
  assert.equal(scope.isCurrent(scope.capture()), false);

  assert.equal(scope.transition("user-a").changed, true);
  assert.equal(scope.isCurrent(request), false);
  assert.equal(scope.isCurrent(scope.capture()), true);
});
