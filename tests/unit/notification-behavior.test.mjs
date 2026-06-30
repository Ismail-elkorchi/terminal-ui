import assert from 'node:assert/strict';
import test from 'node:test';

import {
  notificationReducer,
  notificationsToActivityBlocks,
  visibleNotifications
} from '../../dist/widgets/index.js';

test('notificationReducer adds notifications, replaces ids, and bounds active items/history', () => {
  const empty = { items: [], history: [] };
  const first = notificationReducer(empty, {
    kind: 'add',
    item: { id: 'a', title: 'Alpha', message: 'Ready', tone: 'info', createdAt: 1 }
  }, { maxVisible: 2, maxHistory: 3 });
  const second = notificationReducer(first, {
    kind: 'add',
    item: { id: 'b', title: 'Bravo', tone: 'success', createdAt: 2 }
  }, { maxVisible: 2, maxHistory: 3 });
  const replaced = notificationReducer(second, {
    kind: 'add',
    item: { id: 'a', title: 'Alpha updated', tone: 'warning', createdAt: 3 }
  }, { maxVisible: 2, maxHistory: 3 });
  const third = notificationReducer(replaced, {
    kind: 'add',
    item: { id: 'c', title: 'Charlie', tone: 'error', createdAt: 4 }
  }, { maxVisible: 2, maxHistory: 3 });

  assert.deepEqual(first.items.map((item) => item.id), ['a']);
  assert.deepEqual(second.items.map((item) => item.id), ['b', 'a']);
  assert.deepEqual(replaced.items.map((item) => item.id), ['a', 'b']);
  assert.equal(replaced.items[0]?.title, 'Alpha updated');
  assert.deepEqual(third.items.map((item) => item.id), ['c', 'a']);
  assert.deepEqual(third.history.map((item) => item.id), ['c', 'a', 'b']);
  assert.deepEqual(visibleNotifications(third, { maxVisible: 1 }).map((item) => item.id), ['c']);
});

test('notificationReducer expires, pauses, resumes, and dismisses without owning timers', () => {
  const withItems = notificationReducer({ items: [], history: [] }, {
    kind: 'add',
    item: { id: 'a', title: 'Expires', expiresAt: 10 }
  });
  const paused = notificationReducer(withItems, { kind: 'pause', id: 'a' });
  const tickedPaused = notificationReducer(paused, { kind: 'tick', now: 12 });
  const resumed = notificationReducer(tickedPaused, { kind: 'resume', id: 'a' });
  const expired = notificationReducer(resumed, { kind: 'tick', now: 12 });
  const refilled = notificationReducer(expired, {
    kind: 'add',
    item: { id: 'b', title: 'Dismiss me' }
  });
  const dismissed = notificationReducer(refilled, { kind: 'dismissLatest' });

  assert.equal(paused.items[0]?.paused, true);
  assert.deepEqual(tickedPaused.items.map((item) => item.id), ['a']);
  assert.equal(resumed.items[0]?.paused, undefined);
  assert.deepEqual(expired.items, []);
  assert.deepEqual(dismissed.items, []);
});

test('notificationsToActivityBlocks maps bounded notification history to activity blocks', () => {
  const blocks = notificationsToActivityBlocks([
    { id: 'a', title: 'Import', message: 'Running', tone: 'progress', progress: 47, createdAt: 5 },
    { id: 'b', title: 'Done', tone: 'success' }
  ]);

  assert.equal(blocks[0]?.id, 'notification:a');
  assert.equal(blocks[0]?.status, 'running');
  assert.deepEqual(blocks[0]?.fields, [
    { label: 'progress', value: '47%' },
    { label: 'created', value: '5' }
  ]);
  assert.equal(blocks[1]?.status, 'success');
});
