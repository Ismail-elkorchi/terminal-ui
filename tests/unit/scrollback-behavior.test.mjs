import assert from 'node:assert/strict';
import test from 'node:test';

import {
  followTailScrollState,
  nextScrollbackMatch,
  scrollbackReducer,
  scrollbackSearchMarks,
  visibleScrollbackItems
} from '../../dist/widgets/index.js';

const items = [
  { id: 'a', text: 'alpha\nmore alpha' },
  { id: 'b', text: 'bravo needle' },
  { id: 'c', text: 'charlie needle needle' }
];

test('scrollbackReducer owns search match fold and follow-tail state', () => {
  const initial = { foldedIds: [], followTail: true };
  const searching = scrollbackReducer(initial, { kind: 'setSearchQuery', query: 'needle' });
  const jumped = scrollbackReducer(searching, { kind: 'jumpMatch', direction: 1, matchCount: 3 });
  const folded = scrollbackReducer(jumped, { kind: 'toggleFold', id: 'a' });
  const unfollowed = scrollbackReducer(folded, { kind: 'setFollowTail', followTail: false });
  const cleared = scrollbackReducer(unfollowed, { kind: 'setSearchQuery', query: '' });

  assert.deepEqual(searching, { foldedIds: [], followTail: true, searchQuery: 'needle', selectedMatchIndex: 0 });
  assert.equal(jumped.selectedMatchIndex, 1);
  assert.deepEqual(folded.foldedIds, ['a']);
  assert.equal(unfollowed.followTail, false);
  assert.equal(cleared.searchQuery, undefined);
  assert.equal(cleared.selectedMatchIndex, undefined);
});

test('scrollbackSearchMarks and nextScrollbackMatch expose compact search state', () => {
  const marks = scrollbackSearchMarks(items, 'needle');

  assert.deepEqual(marks, [
    { itemId: 'b', itemIndex: 1, matchCount: 1 },
    { itemId: 'c', itemIndex: 2, matchCount: 2 }
  ]);
  assert.deepEqual(nextScrollbackMatch(marks, 0, 1), marks[1]);
  assert.deepEqual(nextScrollbackMatch(marks, 1, 1), marks[0]);
});

test('visibleScrollbackItems folds records without mutating source items', () => {
  const visible = visibleScrollbackItems(items, { foldedIds: ['a'] });

  assert.equal(visible[0]?.text, 'alpha');
  assert.equal(items[0]?.text, 'alpha\nmore alpha');
});

test('followTailScrollState returns a bottom-pinned scroll state', () => {
  const scroll = followTailScrollState({ contentRows: 25, viewportRows: 5 });

  assert.equal(scroll.offsetRow, 20);
  assert.equal(scroll.followTail, true);
});
