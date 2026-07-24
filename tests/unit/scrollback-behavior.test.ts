import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendScrollbackHistory,
  followTailScrollState,
  nextScrollbackMatch,
  prepareScrollbackHistory,
  scrollbackScrollablePresentation,
  scrollbackReducer,
  scrollbackSearchMatches,
  scrollbackHistoryItemAt
} from '../../dist/behavior/index.js';

const items = [
  { id: 'a', text: 'alpha\nmore alpha' },
  { id: 'b', text: 'bravo needle' },
  { id: 'c', text: 'charlie needle needle' }
];
const history = prepareScrollbackHistory(items);

void test('scrollbackReducer owns search match fold and follow-tail state', () => {
  const initial = { foldedIds: [], followTail: true };
  const matches = scrollbackSearchMatches(history, 'needle');
  const searching = scrollbackReducer(initial, { kind: 'setSearchQuery', query: 'needle' });
  const jumped = scrollbackReducer(searching, { kind: 'jumpMatch', direction: 1, matches });
  const folded = scrollbackReducer(jumped, { kind: 'toggleFold', id: 'a' });
  const unfollowed = scrollbackReducer(folded, { kind: 'setFollowTail', followTail: false });
  const cleared = scrollbackReducer(unfollowed, { kind: 'setSearchQuery', query: '' });

  assert.deepEqual(searching, { foldedIds: [], followTail: true, searchQuery: 'needle' });
  assert.equal(jumped.selectedMatch?.id, matches[0]?.id);
  assert.deepEqual(folded.foldedIds, ['a']);
  assert.equal(unfollowed.followTail, false);
  assert.equal(cleared.searchQuery, undefined);
  assert.equal(cleared.selectedMatch, undefined);
});

void test('scrollbackSearchMatches and nextScrollbackMatch expose one ordered occurrence domain', () => {
  const matches = scrollbackSearchMatches(history, 'needle');

  assert.equal(matches.length, 3);
  assert.deepEqual(matches.map(({
    itemId,
    occurrenceIndex,
    field,
    startOffset,
    endOffsetExclusive
  }) => ({
    itemId,
    occurrenceIndex,
    field,
    startOffset,
    endOffsetExclusive
  })), [
    { itemId: 'b', occurrenceIndex: 0, field: 'body', startOffset: 6, endOffsetExclusive: 12 },
    { itemId: 'c', occurrenceIndex: 0, field: 'body', startOffset: 8, endOffsetExclusive: 14 },
    { itemId: 'c', occurrenceIndex: 1, field: 'body', startOffset: 15, endOffsetExclusive: 21 }
  ]);
  assert.equal(nextScrollbackMatch(matches, matches[0]?.id, 1)?.id, matches[1]?.id);
  assert.equal(nextScrollbackMatch(matches, matches[2]?.id, 1)?.id, matches[0]?.id);
});

void test('scrollback search uses one grapheme-aware contract across every searchable field', () => {
  const searchableHistory = prepareScrollbackHistory([{
    id: 'metadata',
    timestamp: '10:30',
    metadata: { owner: 'family 👨‍👩‍👧‍👦' },
    text: 'body'
  }]);

  assert.deepEqual(scrollbackSearchMatches(searchableHistory, 'owner').map((match) => match.field), [
    'metadataKey'
  ]);
  assert.deepEqual(scrollbackSearchMatches(searchableHistory, '👨'), []);
});

void test('scrollback append reserves a separator after an empty record', () => {
  const initial = prepareScrollbackHistory([{ id: 'empty', text: '' }]);
  const appended = appendScrollbackHistory(initial, [{ id: 'next', text: 'x' }]);

  assert.equal(scrollbackHistoryItemAt(initial, 0)?.bodyOffset, 0);
  assert.equal(scrollbackHistoryItemAt(appended, 1)?.bodyOffset, 1);
  assert.equal(appended.bodyLength, 2);
});

void test('scrollbackPresentation projects fold, search, follow-tail, and scroll state', () => {
  const scroll = followTailScrollState({ contentRows: 25, viewportRows: 5 });
  const projection = scrollbackScrollablePresentation(history, {
    foldedIds: ['a'],
    followTail: true,
    searchQuery: 'needle',
    scroll
  });

  assert.equal(projection.history, history);
  assert.deepEqual(projection.foldedIds, ['a']);
  assert.equal(scrollbackHistoryItemAt(projection.history, 0)?.bodyText, 'alpha\nmore alpha');
  assert.equal(projection.searchQuery, 'needle');
  assert.equal(projection.followTail, true);
  assert.equal(projection.scroll, scroll);
});

void test('followTailScrollState returns a bottom-pinned scroll state', () => {
  const scroll = followTailScrollState({ contentRows: 25, viewportRows: 5 });

  assert.equal(scroll.offsetRow, 20);
  assert.equal(scroll.followTail, true);
});

void test('scrollbackReducer owns pointer selection without retaining an empty range', () => {
  const initial = { foldedIds: [], followTail: true };
  const selected = scrollbackReducer(initial, {
    kind: 'pointer',
    action: {
      kind: 'extendSelection',
      anchor: { itemId: 'b', offset: 8 },
      position: { itemId: 'a', offset: 2 }
    }
  });
  const cleared = scrollbackReducer(selected, {
    kind: 'pointer',
    action: { kind: 'placeCaret', position: { itemId: 'a', offset: 4 } }
  });

  assert.deepEqual(selected.selection, {
    anchor: { itemId: 'b', offset: 8 },
    focus: { itemId: 'a', offset: 2 }
  });
  assert.equal('selection' in cleared, false);
});

void test('scrollbackReducer preserves identity for no-op query fold scroll and navigation actions', () => {
  const scroll = followTailScrollState({ contentRows: 25, viewportRows: 5 });
  const matches = scrollbackSearchMatches(history, 'needle');
  const state = scrollbackReducer({ foldedIds: ['a'], followTail: true, searchQuery: 'needle', scroll }, {
    kind: 'jumpMatch',
    direction: 1,
    matches
  });

  assert.equal(scrollbackReducer(state, { kind: 'setSearchQuery', query: ' needle ' }), state);
  assert.equal(scrollbackReducer(state, { kind: 'fold', id: 'a' }), state);
  assert.equal(scrollbackReducer(state, { kind: 'setFollowTail', followTail: true }), state);
  assert.notEqual(state.selectedMatch, undefined);
  const selectedMatch = state.selectedMatch;
  if (selectedMatch === undefined) throw new Error('Expected a selected scrollback match.');
  assert.equal(scrollbackReducer(state, { kind: 'jumpMatch', direction: 1, matches: [selectedMatch] }), state);
  const cleared = scrollbackReducer(state, { kind: 'jumpMatch', direction: 1, matches: [] });
  assert.equal(cleared.selectedMatch, undefined);
});
