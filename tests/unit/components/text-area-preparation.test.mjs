import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareTextAreaLayout, textArea, createTextAreaDecorations } from '../../../dist/components/index.js';
import { createTextDocument, defaultTextWidthProfile, textDocumentEdit } from '../../../dist/text/index.js';
import { defaultTheme, mergeThemes } from '../../../dist/theme/index.js';
import { renderElementSnapshot } from '../../../dist/testing/index.js';
import { createTextAreaModel } from '../../../dist/components/text-area/model.js';
import { textAreaGeometry, textAreaCommittedLayout, measureTextArea } from '../../../dist/components/text-area/geometry.js';

import { committedTextAreaLayoutRequest } from '../../../dist/components/text-area/prepared-layout.js';

const constraints = { width: 80, height: 12, theme: defaultTheme, widthProfile: defaultTextWidthProfile };
const context = () => ({ signal: new globalThis.AbortController().signal, yield: () => Promise.resolve() });
function options(document, extra = {}) {
  return { id: 'editor', meta: { accessibleName: 'Prepared editor' }, state: { document, caret: { position: { offset: 0, affinity: 'downstream' } },
    scroll: { offsetRow: 0, offsetColumn: 0, followTail: false } },
    wrap: true, lineNumbers: true, scrollbar: { visible: 'auto', axis: 'vertical' },
    onTransition: () => ({ kind: 'transition' }), ...extra };
}
function input(value, bounds = { row: 0, column: 0, width: 80, height: 12 }, profile = defaultTextWidthProfile) {
  return { model: createTextAreaModel(value), bounds, viewport: bounds, theme: defaultTheme, widthProfile: profile,
    disabled: false, busy: false, readOnly: false, inert: false };
}
function render(value, size = constraints) {
  return renderElementSnapshot({ element: textArea(value), terminalSize: { columns: size.width, rows: size.height },
    theme: size.theme, widthProfile: size.widthProfile, focusPath: ['editor'] });
}
function requestFor(value, size = constraints) {
  const pending = input({ ...value, preparedLayout: value.preparedLayout ?? null, onLayoutRequest: () => ({ kind: 'request' }) },
    { row: 0, column: 0, width: size.width, height: size.height }, size.widthProfile);
  const measurement = { ...pending, theme: size.theme, constraints: { width: size.width, height: size.height },
    childCount: 0, measureChild: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 0, preferredHeight: 0 }),
    slots: { count: () => 0, measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 0, preferredHeight: 0 }) } };
  measureTextArea(measurement);
  return committedTextAreaLayoutRequest({ ...pending, theme: size.theme, allocatedBounds: pending.bounds, commitId: 'request' });
}
function constructionProbe() {
  const freeze = Object.freeze;
  let visual = 0;
  let measured = 0;
  Object.freeze = value => {
    if (value !== null && typeof value === 'object') {
      if ('localStart' in value && 'firstVisualLine' in value) visual++;
      if ('startOffset' in value && 'cells' in value && 'text' in value) measured++;
    }
    return freeze(value);
  };
  return { counts: () => ({ visual, measured }), reset: () => { visual = 0; measured = 0; }, restore: () => { Object.freeze = freeze; } };
}

test('cold wrapping and resize prepare actual gutter/scrollbar geometry; admitted paint does no full row construction', async () => {
  const document = createTextDocument(`cold:${'·界é😀 '.repeat(25_000)}`);
  const value = options(document);
  const probe = constructionProbe();
  let checkpoints = 0;
  try {
    const preparedLayout = await prepareTextAreaLayout(requestFor(value), { ...context(), yield: async () => { checkpoints++; } });
    assert.ok(checkpoints > 100);
    assert.ok(probe.counts().visual > 1_000, 'actual wrapped rows must be built during preparation');
    assert.equal(Object.isFrozen(preparedLayout), true);
    probe.reset();
    const snapshot = render({ ...value, preparedLayout, onLayout: () => ({ kind: 'layout' }) });
    assert.equal(probe.counts().visual, 0, 'first accepted paint must not construct wrapped rows');
    assert.ok(probe.counts().measured < 1_000, 'only visible row indexes may be materialized');
    assert.match(snapshot.accessibleText, /cold:/u);
    const next = { ...constraints, width: 41 };
    checkpoints = 0;
    const resized = await prepareTextAreaLayout(requestFor(value, next), { ...context(), yield: async () => { checkpoints++; } });
    assert.ok(checkpoints > 10, 'width-only rewrap is checkpointed even with source geometry warm');
    probe.reset();
    render({ ...value, preparedLayout: resized }, next);
    assert.equal(probe.counts().visual, 0);
    assert.ok(probe.counts().measured < 1_000);
  } finally { probe.restore(); }
});

test('prepared geometry preserves wrapping, selection, caret reveal, scroll, callbacks and current origin', async () => {
  const document = createTextDocument(`prefix ${'界 é 😀 '.repeat(100)}\nnext`);
  const value = options(document, { error: 'Example error' });
  const preparedLayout = await prepareTextAreaLayout(requestFor(value), context());
  for (const state of [value.state,
    { ...value.state, caret: { position: { offset: 600, affinity: 'upstream' } }, revealCaret: true },
    { ...value.state, scroll: { offsetRow: 5, offsetColumn: 0, followTail: false }, selection: {
      anchor: { offset: 10, affinity: 'downstream' }, focus: { offset: 200, affinity: 'upstream' } } },
  ]) {
    const actual = render({ ...value, state, preparedLayout, onTransition: () => ({ kind: 'new-callback' }) });
    const expected = render({ ...value, state });
    assert.equal(actual.plainTextFrame, expected.plainTextFrame);
    assert.equal(actual.accessibilityJson, expected.accessibilityJson);
    assert.equal(actual.focusTargetJson, expected.focusTargetJson);
    const bounds = { row: 7, column: 9, width: 80, height: 12 };
    const prepared = textAreaGeometry(input({ ...value, state, preparedLayout }, bounds));
    const direct = textAreaGeometry(input({ ...value, state }, bounds));
    assert.deepEqual(prepared.scrollbar, direct.scrollbar);
  }
  const withObservation = input({ ...value, preparedLayout, onLayout: () => ({ kind: 'layout' }) });
  const observed = textAreaCommittedLayout({ ...withObservation, allocatedBounds: withObservation.bounds, commitId: 'ready' });
  assert.equal(observed.rowOffsetMap.rowCount, textAreaGeometry(withObservation).layout.contentRows);
});

test('preparation snapshots mutable dependencies and rejects stale or forged capabilities without sync fallback', async () => {
  const document = createTextDocument('mutation ' + '·'.repeat(90_000));
  const value = options(document, { lineNumbers: { minWidth: 2, startNumber: 1 }, wrap: { mode: 'soft' } });
  const profile = { emoji: 'wide', ambiguous: 'narrow' };
  const size = { ...constraints, widthProfile: profile };
  let changed = false;
  const preparedLayout = await prepareTextAreaLayout(requestFor(value, size), { ...context(), yield: async () => {
    if (changed) return;
    changed = true;
    value.lineNumbers.minWidth = 8; value.wrap.mode = 'none'; value.scrollbar.visible = 'never';
    profile.ambiguous = 'wide'; size.width = 40;
  } });
  assert.equal(preparedLayout.width, 80);
  assert.equal(preparedLayout.wrap, true);
  assert.equal(preparedLayout.widthProfile.ambiguous, 'narrow');
  const original = options(document, { lineNumbers: { minWidth: 2, startNumber: 1 } });
  render({ ...original, preparedLayout });
  const probe = constructionProbe();
  try {
    for (const stale of [value, { ...original, wrap: false }, { ...original, lineNumbers: false },
      { ...original, error: 'new error' }, { ...original, placeholder: 'other' },
      { ...original, decorations: createTextAreaDecorations({ document, decorations: [{ kind: 'style', startOffset: 0, endOffsetExclusive: 1, style: { bold: true } }] }) },
      { ...original, state: { ...original.state, document: textDocumentEdit(document, { startOffset: 0, endOffsetExclusive: 0 }, 'x').document } },
    ]) assert.throws(() => render({ ...stale, preparedLayout }), /preparedLayout/u);
    assert.throws(() => render({ ...original, preparedLayout }, { ...constraints, width: 40 }), /preparedLayout/u);
    assert.throws(() => render({ ...original, preparedLayout }, { ...constraints, height: 8 }), /preparedLayout/u);
    assert.throws(() => render({ ...original, preparedLayout }, { ...constraints, widthProfile: profile }), /preparedLayout/u);
    assert.throws(() => render({ ...original, preparedLayout }, { ...constraints, theme: mergeThemes(defaultTheme, { name: 'other' }) }), /preparedLayout/u);
    assert.throws(() => render({ ...original, preparedLayout: { ...preparedLayout } }), /preparedLayout/u);
    assert.equal(probe.counts().visual, 0);
  } finally { probe.restore(); }
});

test('cancellation covers cold source preparation and warm wrapping; no partial capability escapes', async () => {
  const value = options(createTextDocument('abort ' + '·'.repeat(110_000)));
  for (const width of [80, 40]) {
    const controller = new globalThis.AbortController();
    let calls = 0;
    await assert.rejects(prepareTextAreaLayout(requestFor(value, { ...constraints, width }), {
      signal: controller.signal, yield: async () => { if (++calls === 2) controller.abort(); },
    }), { name: 'AbortError' });
    assert.equal(calls, 2);
    const result = await prepareTextAreaLayout(requestFor(value, { ...constraints, width }), context());
    render({ ...value, preparedLayout: result }, { ...constraints, width });
  }
  const signal = globalThis.AbortSignal.abort();
  assert.throws(() => prepareTextAreaLayout(requestFor(value), { signal, yield: async () => {} }), { name: 'AbortError' });
  assert.throws(() => prepareTextAreaLayout({ ...requestFor(value) }, context()), /request|Request/u);
  assert.throws(() => textArea({ ...value, preparedLayout: null }), /onLayoutRequest/u);
});


test('every pending component hook avoids cold source normalization, projection and accessibility', () => {
  const document = createTextDocument('a\t界'.repeat(40_000));
  const value = options(document, { preparedLayout: null, onLayoutRequest: () => ({ kind: 'request' }),
    state: { document, caret: { position: { offset: 159_999, affinity: 'downstream' } },
      selection: { anchor: { offset: 0, affinity: 'downstream' }, focus: { offset: 159_999, affinity: 'upstream' } } },
    scrollbar: undefined,
  });
  const segment = Intl.Segmenter.prototype.segment;
  const probe = constructionProbe();
  Intl.Segmenter.prototype.segment = function(text) {
    assert.ok(text.length < 1_024, 'pending hooks must not scan or normalize the cold document');
    return segment.call(this, text);
  };
  try {
    const pending = render(value);
    assert.match(pending.plainTextFrame, /Preparing editor/u);
    assert.match(pending.accessibilityJson, /"busy": true/u);
    assert.doesNotMatch(pending.accessibleText, /a\t界/u);
    assert.equal(probe.counts().visual, 0);
    assert.ok(probe.counts().measured < 100);
  } finally { Intl.Segmenter.prototype.segment = segment; probe.restore(); }
});

test('large placeholder and error sanitation stay in preparation and ready empty-source observations remain exact', async () => {
  const document = createTextDocument('');
  const value = options(document, { placeholder: '·'.repeat(120_000), error: '\u001b[31mInvalid\u001b[0m',
    preparedLayout: null, onLayoutRequest: () => ({ kind: 'request' }) });
  const probe = constructionProbe();
  try {
    const pending = render(value);
    assert.match(pending.plainTextFrame, /Preparing editor/u);
    assert.equal(probe.counts().visual, 0);
    let yields = 0;
    const preparedLayout = await prepareTextAreaLayout(requestFor(value), { ...context(), yield: async () => { yields++; } });
    assert.ok(yields > 100);
    probe.reset();
    const actual = render({ ...value, preparedLayout });
    assert.equal(probe.counts().visual, 0);
    const direct = render({ ...value, preparedLayout: undefined, onLayoutRequest: undefined });
    assert.equal(actual.plainTextFrame, direct.plainTextFrame);
    assert.equal(actual.accessibilityJson, direct.accessibilityJson);
    const ready = input({ ...value, preparedLayout, onLayout: () => ({ kind: 'layout' }) });
    const observed = textAreaCommittedLayout({ ...ready, allocatedBounds: ready.bounds, commitId: 'ready' });
    assert.equal(observed.rowOffsetMap.rowCount, 1);
    assert.equal(observed.rowOffsetMap.sourceOffsetAtRow(0), 0);
  } finally { probe.restore(); }
});
