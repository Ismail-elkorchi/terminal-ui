import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNotificationState,
  nextNotificationExpiry,
  notificationActionFromStack,
  notificationPresentation,
  notificationReducer
} from '../../dist/behavior/index.js';

test('notification controller keeps visible capacity, queue order, conflicts, and history explicit', () => {
  const policy = { maxVisible: 2, maxQueued: 2, maxHistory: 4 };
  let state = createNotificationState();
  state = notificationReducer(state, enqueue('a', 'Alpha', 1), policy);
  state = notificationReducer(state, enqueue('b', 'Bravo', 2), policy);
  state = notificationReducer(state, enqueue('c', 'Charlie', 3), policy);

  assert.deepEqual(state.active.map((item) => item.id), ['b', 'a']);
  assert.deepEqual(state.queued.map((item) => item.id), ['c']);
  assert.equal(state.selected, 'a');

  const ignored = notificationReducer(state, enqueue('a', 'Ignored', 4), policy);
  assert.equal(ignored, state);

  state = notificationReducer(state, {
    ...enqueue('a', 'Alpha updated', 5),
    conflict: 'replace-existing'
  }, policy);
  assert.deepEqual(state.active.map((item) => item.id), ['a', 'b']);
  assert.equal(state.history[0]?.reason, 'replaced');

  state = notificationReducer(state, enqueue('d', 'Delta', 6), policy);
  state = notificationReducer(state, enqueue('e', 'Echo', 7), policy);
  assert.deepEqual(state.queued.map((item) => item.id), ['d', 'e']);
  assert.equal(state.history[0]?.notification.id, 'c');
  assert.equal(state.history[0]?.reason, 'capacity');
});

test('notification controller pauses deadlines, resumes them, expires records, and promotes queued work', () => {
  const policy = { maxVisible: 1 };
  let state = notificationReducer(createNotificationState(), {
    kind: 'enqueue',
    notification: { id: 'a', title: 'Expires', durationMs: 10_000 },
    now: 0
  }, policy);
  state = notificationReducer(state, {
    kind: 'enqueue',
    notification: { id: 'b', title: 'Queued', durationMs: 5_000 },
    now: 1
  }, policy);
  state = notificationReducer(state, { kind: 'pause', id: 'a', now: 4_000 }, policy);

  assert.equal(state.active[0]?.paused, true);
  assert.equal(state.active[0]?.remainingMs, 6_000);
  assert.equal(nextNotificationExpiry(state), undefined);
  assert.equal(notificationPresentation(state, { now: 20_000 }).items[0]?.detail, 'paused · ttl 6s');

  state = notificationReducer(state, { kind: 'expire', now: 20_000 }, policy);
  assert.equal(state.active[0]?.id, 'a');
  state = notificationReducer(state, { kind: 'resume', id: 'a', now: 20_000 }, policy);
  assert.equal(nextNotificationExpiry(state), 26_000);
  state = notificationReducer(state, { kind: 'expire', now: 26_000 }, policy);

  assert.equal(state.active[0]?.id, 'b');
  assert.equal(state.active[0]?.expiresAt, 31_000);
  assert.equal(state.history[0]?.reason, 'expired');
});

test('notification component actions convert to controller actions with explicit time', () => {
  assert.deepEqual(notificationActionFromStack({ kind: 'move', delta: 1 }, 50), {
    kind: 'moveSelection',
    delta: 1,
    now: 50
  });
  assert.deepEqual(notificationActionFromStack({ kind: 'dismiss', id: 'a' }, 50), {
    kind: 'dismiss',
    id: 'a',
    now: 50
  });
});

test('notification capacity records each dropped item exactly once with the action time', () => {
  const policy = { maxVisible: 1, maxQueued: 1, maxHistory: 10 };
  let state = createNotificationState();
  state = notificationReducer(state, enqueue('a', 'Alpha', 1), policy);
  state = notificationReducer(state, enqueue('b', 'Bravo', 2), policy);
  state = notificationReducer(state, enqueue('c', 'Charlie', 3), policy);

  assert.deepEqual(state.queued.map((item) => item.id), ['c']);
  assert.deepEqual(state.history.map((entry) => entry.notification.id), ['b']);
  assert.equal(state.history[0]?.endedAt, 3);
});

function enqueue(id, title, now) {
  return { kind: 'enqueue', notification: { id, title }, now };
}
