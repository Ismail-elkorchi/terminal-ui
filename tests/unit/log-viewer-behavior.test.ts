import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendLogHistory,
  followTailScrollState,
  nextLogViewerMatch,
  prepareLogHistory,
  logViewerReducer,
  logViewerSearchMatches,
  logHistoryEntryAt
} from '../../dist/behavior/index.js';

const entries = [
  { id: 'a', text: 'alpha\nmore alpha' },
  { id: 'b', text: 'bravo needle' },
  { id: 'c', text: 'charlie needle needle' }
];
const history = prepareLogHistory(entries);

void test('logViewerReducer owns search match fold and follow-tail state', () => {
  const initial = { foldedIds: [], followTail: true };
  const matches = logViewerSearchMatches(history, 'needle');
  const searching = logViewerReducer(initial, { kind: 'setSearchQuery', query: 'needle' });
  const jumped = logViewerReducer(searching, { kind: 'jumpMatch', direction: 1, matches });
  const folded = logViewerReducer(jumped, { kind: 'toggleFold', id: 'a' });
  const unfollowed = logViewerReducer(folded, { kind: 'setFollowTail', followTail: false });
  const cleared = logViewerReducer(unfollowed, { kind: 'setSearchQuery', query: '' });

  assert.deepEqual(searching, { foldedIds: [], followTail: true, searchQuery: 'needle' });
  assert.equal(jumped.selectedMatch?.id, matches[0]?.id);
  assert.deepEqual(folded.foldedIds, ['a']);
  assert.equal(unfollowed.followTail, false);
  assert.equal(cleared.searchQuery, undefined);
  assert.equal(cleared.selectedMatch, undefined);
});

void test('logViewerSearchMatches and nextLogViewerMatch expose one ordered occurrence domain', () => {
  const matches = logViewerSearchMatches(history, 'needle');

  assert.equal(matches.length, 3);
  assert.deepEqual(matches.map(({
    entryId,
    occurrenceIndex,
    field,
    startOffset,
    endOffsetExclusive
  }) => ({
    entryId,
    occurrenceIndex,
    field,
    startOffset,
    endOffsetExclusive
  })), [
    { entryId: 'b', occurrenceIndex: 0, field: 'body', startOffset: 6, endOffsetExclusive: 12 },
    { entryId: 'c', occurrenceIndex: 0, field: 'body', startOffset: 8, endOffsetExclusive: 14 },
    { entryId: 'c', occurrenceIndex: 1, field: 'body', startOffset: 15, endOffsetExclusive: 21 }
  ]);
  assert.equal(nextLogViewerMatch(matches, matches[0]?.id, 1)?.id, matches[1]?.id);
  assert.equal(nextLogViewerMatch(matches, matches[2]?.id, 1)?.id, matches[0]?.id);
});

void test('log viewer search uses one grapheme-aware contract across every searchable field', () => {
  const searchableHistory = prepareLogHistory([{
    id: 'metadata',
    timestamp: '10:30',
    metadata: { owner: 'family 👨‍👩‍👧‍👦' },
    text: 'body'
  }]);

  assert.deepEqual(logViewerSearchMatches(searchableHistory, 'owner').map((match) => match.field), [
    'metadataKey'
  ]);
  assert.deepEqual(logViewerSearchMatches(searchableHistory, '👨'), []);
});

void test('log viewer append reserves a separator after an empty record', () => {
  const initial = prepareLogHistory([{ id: 'empty', text: '' }]);
  const appended = appendLogHistory(initial, [{ id: 'next', text: 'x' }]);

  assert.equal(logHistoryEntryAt(initial, 0)?.bodyOffset, 0);
  assert.equal(logHistoryEntryAt(appended, 1)?.bodyOffset, 1);
  assert.equal(appended.bodyLength, 2);
});

void test('followTailScrollState returns a bottom-pinned scroll state', () => {
  const scroll = followTailScrollState({ contentRows: 25, viewportRows: 5 });

  assert.equal(scroll.offsetRow, 20);
  assert.equal(scroll.followTail, true);
});

void test('logViewerReducer owns pointer selection without retaining an empty range', () => {
  const initial = { foldedIds: [], followTail: true };
  const selected = logViewerReducer(initial, {
    kind: 'pointer',
    action: {
      kind: 'extendSelection',
      anchor: { entryId: 'b', offset: 8 },
      position: { entryId: 'a', offset: 2 }
    }
  });
  const cleared = logViewerReducer(selected, {
    kind: 'pointer',
    action: { kind: 'placeCaret', position: { entryId: 'a', offset: 4 } }
  });

  assert.deepEqual(selected.selection, {
    anchor: { entryId: 'b', offset: 8 },
    focus: { entryId: 'a', offset: 2 }
  });
  assert.equal('selection' in cleared, false);
});

void test('logViewerReducer preserves identity for no-op query fold scroll and navigation actions', () => {
  const scroll = followTailScrollState({ contentRows: 25, viewportRows: 5 });
  const matches = logViewerSearchMatches(history, 'needle');
  const state = logViewerReducer({ foldedIds: ['a'], followTail: true, searchQuery: 'needle', scroll }, {
    kind: 'jumpMatch',
    direction: 1,
    matches
  });

  assert.equal(logViewerReducer(state, { kind: 'setSearchQuery', query: ' needle ' }), state);
  assert.equal(logViewerReducer(state, { kind: 'fold', id: 'a' }), state);
  assert.equal(logViewerReducer(state, { kind: 'setFollowTail', followTail: true }), state);
  assert.notEqual(state.selectedMatch, undefined);
  const selectedMatch = state.selectedMatch;
  if (selectedMatch === undefined) throw new Error('Expected a selected log viewer match.');
  assert.equal(logViewerReducer(state, { kind: 'jumpMatch', direction: 1, matches: [selectedMatch] }), state);
  const cleared = logViewerReducer(state, { kind: 'jumpMatch', direction: 1, matches: [] });
  assert.equal(cleared.selectedMatch, undefined);
});
