import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendLogHistory,
  followTailScrollState,
  nextLogViewerMatch,
  createLogHistory,
  logViewerReducer,
  createLogViewerView,
  logHistoryEntryAt
} from '../../../dist/behavior/index.js';
import { compileCollectionQuery } from '../../../dist/text/index.js';

const entries = [
  { id: 'a', text: 'alpha\nmore alpha' },
  { id: 'b', text: 'bravo needle' },
  { id: 'c', text: 'charlie needle needle' }
];
const history = createLogHistory(entries);

void test('logViewerReducer owns search match fold and follow-tail state', () => {
  const initial = { foldedIds: [], followTail: true };
  const view = createLogViewerView({ history, query: { text: 'needle', mode: 'contains' } });
  const matches = view.matches;
  const options = { history, view: createLogViewerView({ history, query: { text: 'needle', mode: 'contains' } }) };
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

void test('createLogViewerView and nextLogViewerMatch expose one ordered occurrence domain', () => {
  const view = createLogViewerView({ history, query: { text: 'needle', mode: 'contains' } });
  const matches = view.matches;

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
  assert.equal(nextLogViewerMatch(view, matches[0]?.id, 1)?.id, matches[1]?.id);
  assert.equal(nextLogViewerMatch(view, matches[2]?.id, 1)?.id, matches[0]?.id);
});

void test('log viewer search uses one grapheme-aware contract across every searchable field', () => {
  const searchableHistory = createLogHistory([{
    id: 'metadata',
    timestamp: '10:30',
    metadata: { owner: 'family 👨‍👩‍👧‍👦' },
    text: 'body'
  }]);

  assert.deepEqual(createLogViewerView({ history: searchableHistory, query: { text: 'owner' } }).matches.map((match) => match.field), [
    'metadataKey'
  ]);
  assert.deepEqual(createLogViewerView({ history: searchableHistory, query: { text: '👨' } }).matches, []);
});

void test('log viewer append reserves a separator after an empty record', () => {
  const initial = createLogHistory([{ id: 'empty', text: '' }]);
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
    transition: {
      kind: 'extendSelection',
      anchor: { entryId: 'b', offset: 8 },
      position: { entryId: 'a', offset: 2 }
    }
  }, { history, view: createLogViewerView({ history, query: { text: 'needle' }, foldedIds: ['a'] }) });
  const cleared = logViewerReducer(selected, {
    kind: 'pointer',
    transition: { kind: 'placeCaret', position: { entryId: 'a', offset: 4 } }
  }, { history, view: createLogViewerView({ history, query: { text: 'needle' }, foldedIds: ['a'] }) });

  assert.deepEqual(selected.selection, {
    anchor: { entryId: 'b', offset: 8 },
    focus: { entryId: 'a', offset: 2 }
  });
  assert.equal('selection' in cleared, false);
});

void test('logViewerReducer preserves identity for no-op query, fold, scroll, and navigation transitions', () => {
  const foldedIds = Object.freeze(['a']);
  const scroll = followTailScrollState({ contentRows: 25, viewportRows: 5 });
  const state = logViewerReducer({
    foldedIds,
    followTail: true,
    query: compileCollectionQuery({ text: 'needle', mode: 'contains' }),
    scroll,
  }, {
    kind: 'jumpMatch',
    direction: 1
  }, { history, view: createLogViewerView({ history, query: { text: 'needle' }, foldedIds }) });

  assert.equal(logViewerReducer(state, { kind: 'setQuery', query: { text: ' needle ' } }, { history, view: null }), state);
  assert.equal(logViewerReducer(state, { kind: 'fold', id: 'a' }, { history, view: null }), state);
  assert.equal(logViewerReducer(state, { kind: 'setFollowTail', followTail: true }, { history, view: null }), state);
  assert.notEqual(state.activeMatchId, undefined);
  const cleared = logViewerReducer(state, { kind: 'setQuery', query: { text: '' } }, { history, view: createLogViewerView({ history, query: { text: 'needle' }, foldedIds }) });
  assert.equal(cleared.activeMatchId, undefined);
});
