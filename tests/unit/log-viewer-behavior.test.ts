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
  const matches = logViewerSearchMatches(history, { text: 'needle', mode: 'contains' });
  const options = { history };
  const searching = logViewerReducer(initial, { kind: 'setQuery', query: { text: 'needle' } }, options);
  const jumped = logViewerReducer(searching, { kind: 'jumpMatch', direction: 1 }, options);
  const folded = logViewerReducer(jumped, { kind: 'toggleFold', id: 'a' }, options);
  const unfollowed = logViewerReducer(folded, { kind: 'setFollowTail', followTail: false }, options);
  const cleared = logViewerReducer(unfollowed, { kind: 'setQuery', query: { text: '' } }, options);

  assert.equal(searching.query?.text, 'needle');
  assert.equal(jumped.activeMatchId, matches[0]?.id);
  assert.deepEqual(folded.foldedIds, ['a']);
  assert.equal(unfollowed.followTail, false);
  assert.equal(cleared.query, undefined);
  assert.equal(cleared.activeMatchId, undefined);
});

void test('logViewerSearchMatches and nextLogViewerMatch expose one ordered occurrence domain', () => {
  const matches = logViewerSearchMatches(history, { text: 'needle', mode: 'contains' });

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

  assert.deepEqual(logViewerSearchMatches(searchableHistory, { text: 'owner' }).map((match) => match.field), [
    'metadataKey'
  ]);
  assert.deepEqual(logViewerSearchMatches(searchableHistory, { text: '👨' }), []);
});

void test('log viewer append reserves a separator after an empty record', () => {
  const initial = prepareLogHistory([{ id: 'empty', text: '' }]);
  const appended = appendLogHistory(initial, [{ id: 'next', text: 'x' }]);

  assert.equal(logHistoryEntryAt(initial, 0)?.bodyOffset, 0);
  assert.equal(logHistoryEntryAt(appended, 1)?.bodyOffset, 1);
  assert.equal(
    (logHistoryEntryAt(appended, 1)?.bodyOffset ?? 0) + (logHistoryEntryAt(appended, 1)?.bodyText.length ?? 0),
    2,
  );
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
  }, { history });
  const cleared = logViewerReducer(selected, {
    kind: 'pointer',
    action: { kind: 'placeCaret', position: { entryId: 'a', offset: 4 } }
  }, { history });

  assert.deepEqual(selected.selection, {
    anchor: { entryId: 'b', offset: 8 },
    focus: { entryId: 'a', offset: 2 }
  });
  assert.equal('selection' in cleared, false);
});

void test('logViewerReducer preserves identity for no-op query fold scroll and navigation actions', () => {
  const scroll = followTailScrollState({ contentRows: 25, viewportRows: 5 });
  const state = logViewerReducer({
    foldedIds: ['a'],
    followTail: true,
    query: { kind: 'prepared-collection-query', text: 'needle', mode: 'contains', caseSensitive: false },
    scroll,
  }, {
    kind: 'jumpMatch',
    direction: 1
  }, { history });

  assert.equal(logViewerReducer(state, { kind: 'setQuery', query: { text: ' needle ' } }, { history }), state);
  assert.equal(logViewerReducer(state, { kind: 'fold', id: 'a' }, { history }), state);
  assert.equal(logViewerReducer(state, { kind: 'setFollowTail', followTail: true }, { history }), state);
  assert.notEqual(state.activeMatchId, undefined);
  const cleared = logViewerReducer(state, { kind: 'setQuery', query: { text: '' } }, { history });
  assert.equal(cleared.activeMatchId, undefined);
});
