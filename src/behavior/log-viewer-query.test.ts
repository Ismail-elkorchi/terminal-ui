import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogHistory, appendLogHistory } from './log-history.ts';
import { matchingLogViewerView, preparedLogLayout, prepareLogViewerView, createLogViewerView } from './log-viewer-view.ts';
import { logViewerReducer } from './log-viewer-operations.ts';
import { logViewer } from '../components/log-viewer/definition.ts';
import { defaultTextWidthProfile } from '../text/width-profile.ts';
import { renderElementFrame } from '../renderer/index.ts';

void test('one immutable log query result drives folded navigation and rendering', () => {
  const history = createLogHistory([{ id: 'a', text: 'visible\nhidden needle' }, { id: 'b', text: 'visible needle' }]);
  const input = { history, query: { text: 'needle' }, foldedIds: ['a'] };
  const view = createLogViewerView(input);
  assert.ok(Object.isFrozen(view));
  assert.ok(Object.isFrozen(view.matches));
  assert.equal(view.matchingEntries, 1);
  assert.equal(view.matches[0]?.entryId, 'b');
  const state = logViewerReducer({ query: view.query, foldedIds: input.foldedIds, followTail: false }, { kind: 'jumpMatch', direction: 1 }, { history, view });
  assert.equal(state.activeMatchId, view.matches[0].id);
  const rendered = renderElementFrame(logViewer({ id: 'log', ...input, ...state, view }), { columns: 40, rows: 5 });
  assert.match(JSON.stringify(rendered.accessibility), /Matching entries: 1/u);
});

void test('log query identity rejects forged results and ignores stale inputs without scanning', () => {
  const history = createLogHistory([{ id: 'a', text: 'needle' }]);
  const input = { history, query: { text: 'needle' }, foldedIds: [] };
  const result = createLogViewerView(input);
  assert.equal(matchingLogViewerView(input, result), result);
  assert.equal(matchingLogViewerView({ ...input, history: appendLogHistory(history, [{ id: 'b', text: 'other' }]) }, result), undefined);
  assert.equal(matchingLogViewerView({ ...input, query: { text: 'other' } }, result), undefined);
  assert.equal(matchingLogViewerView({ ...input, foldedIds: ['a'] }, result), undefined);
  assert.equal(matchingLogViewerView(input, null), undefined);
  assert.throws(() => matchingLogViewerView(input, { ...result }), /prepared by terminal-ui/u);
  assert.throws(() => logViewer({ id: 'missing', history } as never), /view/u);
});

void test('log preparation owns inputs, yields and cancels before publishing a complete result', async () => {
  const history = createLogHistory(Array.from({ length: 6000 }, (_, index) => ({ id: String(index), text: 'visible\nneedle' })));
  const query = { text: 'needle' };
  const foldedIds: string[] = [];
  const input = { history, query, foldedIds };
  let yields = 0;
  const controller = new AbortController();
  await assert.rejects(prepareLogViewerView(input, { signal: controller.signal, yield: async () => { yields++; controller.abort(new Error('cancelled')); } }), /cancelled/u);
  assert.equal(yields, 1);
  const result = await prepareLogViewerView(input, { signal: new AbortController().signal, yield: async () => { query.text = 'changed'; foldedIds.push('0'); } });
  assert.equal(result.query.text, 'needle');
  assert.equal(result.matchingEntries, 6000);
  assert.equal(matchingLogViewerView({ history, query: { text: 'needle' } }, result), result);
});

void test('prepared wrapped views own geometry and never silently rewrap stale widths or profiles', () => {
  const history = createLogHistory([{ id: 'long', text: 'wrapped content 界🙂 '.repeat(200) }]);
  const view = createLogViewerView({ history, wrap: true, width: 20, widthProfile: defaultTextWidthProfile });
  assert.equal('layouts' in view, false);
  for (const width of [20, 19]) {
    const layout = preparedLogLayout(view, width);
    assert.ok(layout);
    assert.ok(Object.isFrozen(layout) && Object.isFrozen(layout.segments) && layout.segments.every(Object.isFrozen));
  }
  const render = (columns: number, widthProfile = defaultTextWidthProfile) => renderElementFrame(logViewer({ id: 'log', history, wrap: true, view }), { columns, rows: 4 }, { widthProfile });
  assert.doesNotMatch(JSON.stringify(render(20).accessibility), /Preparing/u);
  assert.match(JSON.stringify(render(19).accessibility), /Preparing log layout/u);
  assert.match(JSON.stringify(render(20, { emoji: 'narrow', ambiguous: 'wide' }).accessibility), /Preparing log layout/u);
  assert.throws(() => createLogViewerView({ history, wrap: true, width: -1, widthProfile: defaultTextWidthProfile }), /width/u);
  assert.throws(() => createLogViewerView({ history, wrap: true, width: 20, widthProfile: {} as never }), /profile/u);
});

void test('pending unwrapped search reports pending without partial highlights or false match counts', () => {
  const history = createLogHistory([{ id: 'row', text: 'needle' }]);
  const frame = renderElementFrame(logViewer({ id: 'log', history, query: { text: 'needle' }, view: null }), { columns: 40, rows: 3 });
  assert.match(JSON.stringify(frame.accessibility), /Search pending/u);
  assert.doesNotMatch(JSON.stringify(frame.accessibility), /Matching entries/u);
  assert.equal(frame.cells.some(cell => cell.source?.partType === 'match'), false);
});

void test('warm wrapped history assembly yields and cancels while reusing cached segments', async () => {
  const history = createLogHistory(Array.from({ length: 8192 }, (_, index) => ({ id: String(index), text: 'visible\nhidden' })));
  const foldedIds = Array.from({ length: history.entryCount }, (_, index) => String(index));
  const input = { history, foldedIds, wrap: true as const, width: 40, widthProfile: defaultTextWidthProfile };
  const prior = createLogViewerView(input);
  const appended = { ...input, history: appendLogHistory(history, [{ id: 'appended', text: 'visible' }]) };
  const controller = new AbortController();
  let cancelledYields = 0;
  await assert.rejects(prepareLogViewerView(appended, {
    signal: controller.signal,
    yield: async () => { cancelledYields++; controller.abort(new Error('replaced warm geometry')); },
  }), /replaced warm geometry/u);
  assert.equal(cancelledYields, 1);
  let completedYields = 0;
  const view = await prepareLogViewerView(appended, {
    signal: new AbortController().signal,
    yield: async () => { completedYields++; },
  });
  assert.ok(completedYields >= 64, 'cached segment assembly must retain cooperative checkpoints');
  assert.equal(preparedLogLayout(view, input.width)?.totalRows, 8193);
  assert.equal(preparedLogLayout(view, input.width)?.segments[0]?.rowStarts, preparedLogLayout(prior, input.width)?.segments[0]?.rowStarts);
  assert.equal(preparedLogLayout(view, input.width - 1)?.segments[0]?.rowCounts, preparedLogLayout(prior, input.width - 1)?.segments[0]?.rowCounts);
});

void test('fold domain transitions invalidate active occurrences before accepting their new projection', () => {
  const history = createLogHistory([{ id: 'a', text: 'visible\nhidden needle' }, { id: 'b', text: 'needle' }]);
  const query = { text: 'needle' };
  const view = createLogViewerView({ history, query });
  for (const kind of ['fold', 'toggleFold'] as const) {
    const selection = { anchor: { entryId: 'a', offset: 0 }, focus: { entryId: 'b', offset: 3 } };
    const selected = logViewerReducer({ query: view.query, foldedIds: [], followTail: true, selection }, { kind: 'jumpMatch', direction: 1 }, { history, view });
    assert.equal(selected.activeMatchId, view.matches[0]?.id);
    const folded = logViewerReducer(selected, { kind, id: 'a' }, { history, view });
    assert.equal(folded.activeMatchId, undefined);
    assert.equal(folded.followTail, selected.followTail);
    assert.equal(folded.selection, selection);
    const foldedView = createLogViewerView({ history, query, foldedIds: folded.foldedIds });
    assert.equal(foldedView.matches.length, 1);
    assert.doesNotThrow(() => renderElementFrame(logViewer({ id: 'log', history, ...folded, view: foldedView }), { columns: 40, rows: 5 }));
    const selectedFolded = logViewerReducer(folded, { kind: 'jumpMatch', direction: 1 }, { history, view: foldedView });
    assert.equal(selectedFolded.activeMatchId, foldedView.matches[0]?.id);
    assert.equal(logViewerReducer(selectedFolded, { kind: 'fold', id: 'a' }, { history, view: foldedView }), selectedFolded);
    for (const unfoldKind of ['unfold', 'toggleFold'] as const) {
      const unfolded = logViewerReducer(selectedFolded, { kind: unfoldKind, id: 'a' }, { history, view: foldedView });
      assert.equal(unfolded.activeMatchId, undefined);
      assert.equal(unfolded.selection, selection);
      assert.deepEqual(unfolded.foldedIds, []);
    }
  }
});
