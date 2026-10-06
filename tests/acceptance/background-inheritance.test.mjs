import assert from 'node:assert/strict';
import test from 'node:test';

import { text, textInput } from '../../dist/components/index.js';
import { defineComponent, ignoreMessage } from '../../dist/component/index.js';
import { textInputReducer } from '../../dist/behavior/index.js';
import { resolveTerminalCapabilities } from '../../dist/host/index.js';
import { overlay } from '../../dist/layout/index.js';
import {
  compactRenderSpans, createFrameBuffer, diffFrames, mergeTerminalStyles,
  renderDiffAnsi, renderElementFrame, renderFrameAnsi, renderFramePlain,
  sameTerminalStyle, serializeRenderSpansStateful, span,
} from '../../dist/renderer/index.js';
import { createTerminalHarness, createVisualSnapshot, keyInput } from '../../dist/testing/index.js';
import { defaultTheme, defineTheme, resolveTerminalStyle, terminalStyleHasBackground } from '../../dist/theme/index.js';
import { createTranscriptRecorder, validateTranscript } from '../../dist/transcript/index.js';
import { defineTui } from '../../dist/tui/index.js';

const red = { kind: 'ansi', value: 1 };
const green = { kind: 'ansi', value: 2 };
const blue = { kind: 'ansi', value: 4 };
const yellow = { kind: 'ansi', value: 3 };
const terminalSize = { columns: 12, rows: 1 };
const capabilities = resolveTerminalCapabilities({
  host: { runtime: 'memory', inputIsTty: true, outputIsTty: true,
    supportsRawInput: true, supportsResizeEvents: true, supportsTerminalProtocols: true, colorDepth: 24 },
});
const ansi = { capabilities };
const palette = [red, green, blue];
const backing = defineComponent({
  name: 'background-inheritance/backing', identity: 'optional', structure: 'leaf', semantics: 'decorative',
  measure: () => ({ minWidth: 12, minHeight: 1, preferredWidth: 12, preferredHeight: 1 }),
  render: ({ target }) => target.write(0, 0, palette.map(bg => span('....', { style: { bg } }))),
});

function cellAt(frame, column, row = 1) {
  const cell = frame.cells.find(cell => cell.row === row && cell.column === column);
  assert.ok(cell, `Missing cell ${row}:${column}`);
  return cell;
}

function expectedBackground(column) {
  return palette[Math.floor((column - 1) / 4)];
}

function input(options = {}) {
  return textInput({ id: 'editor', meta: { accessibleName: 'Editor' },
    state: { text: 'ABCDEFGH', cursor: 8 }, onTransition: () => ignoreMessage(), ...options });
}

function assertBackgrounds(frame) {
  for (let column = 1; column <= terminalSize.columns; column++) {
    assert.deepEqual(cellAt(frame, column).style?.bg, expectedBackground(column), `Background at column ${column}`);
  }
}

test('background null survives owned style normalization and right-biased composition distinctly from omission', () => {
  const base = { bg: red, fg: green, bold: true };
  assert.deepEqual(mergeTerminalStyles(base, {}), base, 'omission keeps the earlier background');
  const cleared = mergeTerminalStyles(base, { bg: null });
  assert.deepEqual(cleared, { bg: null, fg: green, bold: true });
  assert.ok(Object.isFrozen(cleared));
  assert.deepEqual(mergeTerminalStyles(cleared, { italic: true }), { ...cleared, italic: true });
  assert.deepEqual(mergeTerminalStyles(cleared, { bg: blue }), { ...cleared, bg: blue });
  assert.deepEqual(mergeTerminalStyles({ bg: null }), { bg: null });
  assert.deepEqual(mergeTerminalStyles({ bg: undefined }), {});
  assert.equal(sameTerminalStyle({ bg: null }, {}), false);
  assert.equal(sameTerminalStyle({ bg: null }, { bg: undefined }), false);
  assert.equal(sameTerminalStyle({ bg: null }, { bg: null }), true);
  assert.notEqual(mergeTerminalStyles({ bg: null }), mergeTerminalStyles({ bg: undefined }), 'canonicalization cannot alias null and omission');
  assert.equal(mergeTerminalStyles({ bg: null }), mergeTerminalStyles({ bg: null }));
  assert.equal(compactRenderSpans([span('a', { style: {} }), span('b', { style: { bg: null } })]).length, 2);
  for (const bg of [false, true, 'transparent', 0, { kind: 'transparent' }]) {
    assert.throws(() => mergeTerminalStyles({ bg }), /style|background|\.bg/u);
  }
  assert.throws(() => mergeTerminalStyles({ fg: null }), /\.fg/u, 'null is a background policy, not a color');
});

test('direct frame buffer resolves an explicit null against each destination and inherits only its background', () => {
  const buffer = createFrameBuffer(4, 1);
  buffer.write(1, 1, [span('a', { style: { bg: red, fg: blue, inverse: true } }), span('b', { style: { bg: green } })]);
  buffer.write(1, 1, [span('XY', { style: { bg: null, fg: yellow, bold: true } })]);
  buffer.writeCell({ row: 1, column: 3, text: 'Z', width: 1, style: { bg: null, underline: true } });
  buffer.write(1, 4, [span('Q', { style: { bg: null } })]);
  const frame = buffer.snapshot();
  assert.deepEqual(cellAt(frame, 1).style, { bg: red, fg: yellow, bold: true });
  assert.deepEqual(cellAt(frame, 2).style, { bg: green, fg: yellow, bold: true });
  assert.equal(cellAt(frame, 3).style?.bg, undefined, 'an empty destination does not materialize null');
  assert.equal(cellAt(frame, 3).style?.underline, true);
  assert.equal(cellAt(frame, 4).style?.bg, undefined);
  assert.equal(JSON.stringify(frame.cells).includes('"bg":null'), false);
  buffer.writeCell({ row: 1, column: 1, text: 'C', width: 1, style: { bg: null } });
  assert.deepEqual(buffer.readCell(1, 1)?.style?.bg, red, 'writeCell uses the same inheritance policy');
  buffer.write(1, 2, [span('D')]);
  assert.equal(buffer.readCell(1, 2)?.style?.bg, undefined, 'direct-buffer omission keeps its existing overwrite behavior');
});

for (const [description, styles] of [
  ['root', { root: { bg: null } }],
  ['ordinary value and border parts', { parts: { value: { bg: null }, border: { bg: null } } }],
]) {
  test(`native textInput ${description} background override inherits different backing cells including padding`, () => {
    const frame = renderElementFrame(overlay([backing({}), input({ styles })]), terminalSize);
    assert.equal(renderFramePlain(frame), '› ABCDEFGH');
    assertBackgrounds(frame);
    assert.equal(cellAt(frame, 1).source?.partName, 'border');
    assert.equal(cellAt(frame, 3).source?.partName, 'value');
    assert.equal(cellAt(frame, 12).source?.partName, 'value');
    assert.equal(cellAt(frame, 12).text, ' ', 'transparent padding still paints its glyph');
    const opaque = renderElementFrame(overlay([backing({}), input()]), terminalSize);
    assert.deepEqual(cellAt(opaque, 3).style?.bg, { kind: 'theme', token: 'control.background' });
  });
}

test('native textInput retains explicit focused chrome and selected colors over transparent ordinary parts', async () => {
  const harness = createTerminalHarness({ terminalSize });
  const app = defineTui({
    init: () => ({ state: { text: 'ABCDEFGH', cursor: 8, selection: { startOffset: 2, endOffsetExclusive: 5 } } }),
    update: (state, transition) => ({ state: textInputReducer(state, transition) }),
    view: state => overlay([backing({}), input({ state, onTransition: transition => transition,
      styles: {
        root: { bg: null },
        parts: { value: { bg: null }, border: { bg: null } },
        states: { focused: { parts: { border: { bg: blue, underline: true } } },
          selected: { parts: { selection: { bg: yellow, fg: red } } } },
      },
    })]),
  });
  await harness.runApp(app, async runtime => {
    const frame = runtime.frame();
    assert.ok(frame.cursor, 'background override does not hide the native cursor');
    assert.deepEqual(cellAt(frame, 1).style?.bg, blue);
    assert.equal(cellAt(frame, 1).style?.underline, true);
    assert.equal(cellAt(frame, 1).style?.bold, true, 'default focus emphasis is retained');
    for (const column of [5, 6, 7]) {
      assert.equal(cellAt(frame, column).source?.partName, 'selection');
      assert.deepEqual(cellAt(frame, column).style?.bg, yellow);
      assert.deepEqual(cellAt(frame, column).style?.fg, red);
    }
    for (const column of [3, 4, 8, 9, 10, 12]) {
      assert.deepEqual(cellAt(frame, column).style?.bg, expectedBackground(column));
    }
    const focusPath = frame.focusPath;
    await harness.input(keyInput('x'));
    assert.equal(runtime.state().text, 'ABxFGH');
    assert.deepEqual(runtime.frame().focusPath, focusPath);
    assert.deepEqual(cellAt(runtime.frame(), 1).style?.bg, blue);
    assert.equal(runtime.frame().cells.some(cell => cell.source?.partName === 'selection'), false);
    assert.ok(runtime.frame().hitTargets.some(target => target.id.includes('editor')));
  });
});

test('native selection default remains visible when only ordinary background is cleared', () => {
  const frame = renderElementFrame(overlay([backing({}), input({
    state: { text: 'ABCDEFGH', cursor: 8, selection: { startOffset: 2, endOffsetExclusive: 5 } },
    styles: { root: { bg: null } },
  })]), terminalSize);
  assert.deepEqual(cellAt(frame, 3).style?.bg, red);
  for (const column of [5, 6, 7]) {
    assert.deepEqual(cellAt(frame, column).style?.bg, { kind: 'theme', token: 'selection.background' });
  }
});

test('a promoted native textInput needs inheritBackground underlay to sample cells in a lower region', () => {
  const make = underlay => renderElementFrame(overlay([backing({}), input({
    meta: { accessibleName: 'Editor', layer: { zIndex: 10, underlay } },
    styles: { root: { bg: null } },
  })]), terminalSize);
  assertBackgrounds(make('inheritBackground'));
  const withoutInheritance = make('preserve');
  for (let column = 1; column <= terminalSize.columns; column++) {
    assert.notDeepEqual(cellAt(withoutInheritance, column).style?.bg, expectedBackground(column),
      'null must not silently change the separate-region underlay policy');
  }
});

test('theme resolution preserves background intent without treating null as a palette color', () => {
  const style = { bg: null, fg: { kind: 'theme', token: 'control.foreground' }, underline: true };
  assert.deepEqual(resolveTerminalStyle(style, defaultTheme), {
    bg: null, fg: defaultTheme.tokens.colors['control.foreground'], underline: true,
  });
  assert.equal(terminalStyleHasBackground(style, defaultTheme), false);
  assert.equal(terminalStyleHasBackground({ bg: { kind: 'default' } }, defaultTheme), true);
  const theme = defineTheme({ tokens: { colors: { 'control.background': blue } } });
  const frame = renderElementFrame(overlay([backing({}), input({ styles: { root: { bg: null } } })]), terminalSize, { theme });
  assertBackgrounds(frame);
  assert.throws(() => defineTheme({ tokens: { colors: { 'control.background': null } } }), /color|object/u);
});

test('null styles serialize through snapshots, full frames, diffs and validated transcript round trips', () => {
  const before = renderElementFrame(overlay([backing({}), input()]), terminalSize);
  const after = renderElementFrame(overlay([backing({}), input({ styles: { root: { bg: null } } })]), terminalSize);
  const diff = diffFrames(before, after);
  assert.ok(diff.operations.length > 0);
  const snapshot = createVisualSnapshot({ frame: after, previousFrame: before, diff, ansi });
  assert.equal(snapshot.plainTextFrame, '› ABCDEFGH');
  assert.deepEqual(JSON.parse(snapshot.frameJson).cells, JSON.parse(JSON.stringify(after.cells)));
  assert.equal(JSON.stringify(JSON.parse(snapshot.frameJson).cells).includes('"bg":null'), false);
  assert.match(renderFrameAnsi(after, ansi), /\u001b\[/u);
  assert.match(renderDiffAnsi(diff, ansi), /\u001b\[/u);
  const recorder = createTranscriptRecorder({ id: 'background-inheritance' });
  for (const [stateVersion, frame, previous] of [[0, before, undefined], [1, after, before]]) {
    recorder.record({ kind: 'commit', commit: { id: `commit-${stateVersion}`, stateVersion, terminalSize,
      frame, focusPath: frame.focusPath, diff: diffFrames(previous, frame) } });
  }
  const restored = JSON.parse(JSON.stringify(recorder.snapshot()));
  const validation = validateTranscript(restored);
  assert.equal(validation.status, 'success', validation.error?.message);
  const retainedFrame = restored.steps.filter(step => step.kind === 'commit').at(-1).commit.frame;
  assertBackgrounds(retainedFrame);
});

test('direct ANSI null resets the prior background and keeps foreground and attributes', () => {
  const actual = serializeRenderSpansStateful([
    span('A', { style: { bg: red, fg: green } }),
    span('B', { style: { bg: null, fg: green, bold: true } }),
  ], ansi);
  const expected = serializeRenderSpansStateful([
    span('A', { style: { bg: red, fg: green } }),
    span('B', { style: { fg: green, bold: true } }),
  ], ansi);
  assert.equal(actual, expected, 'with no destination cell null serializes as a cleared background');
  assert.match(actual, /(?:49|0)[;m]/u);
  const buffer = createFrameBuffer(1, 1);
  buffer.write(1, 1, [span('X', { style: { bg: null } })]);
  const frame = buffer.snapshot({ canvasStyle: { bg: null }, cursor: { row: 1, column: 1, style: { bg: null } } });
  assert.doesNotThrow(() => renderFrameAnsi(frame, ansi));
  assert.doesNotThrow(() => createVisualSnapshot({ frame, ansi }));
  assert.doesNotThrow(() => text({ content: 'Transparent', styles: { root: { bg: null } } }));
  const recorder = createTranscriptRecorder({ id: 'null-canvas-and-cursor' });
  recorder.record({ kind: 'commit', commit: { id: 'commit-0', stateVersion: 0,
    terminalSize: { columns: 1, rows: 1 }, frame, diff: diffFrames(undefined, frame) } });
  const validation = validateTranscript(JSON.parse(JSON.stringify(recorder.snapshot())));
  assert.equal(validation.status, 'success', validation.error?.message);
});

test('a retained native Unicode input resamples changing colored and neutral backing cells', async () => {
  const backgrounds = [
    [red, undefined, blue],
    [undefined, green, yellow],
  ];
  const changingBacking = defineComponent({
    name: 'background-inheritance/changing-backing', identity: 'optional', structure: 'leaf', semantics: 'decorative',
    createModel: ({ colors }) => colors,
    measure: () => ({ minWidth: 12, minHeight: 1, preferredWidth: 12, preferredHeight: 1 }),
    render: ({ target, model }) => target.write(0, 0, model.map((bg, index) => span('.'.repeat([3, 4, 5][index]), bg === undefined ? {} : { style: { bg } }))),
  });
  const retainedInput = input({ state: { text: 'A界🙂B', cursor: 5 },
    styles: { parts: { value: { bg: null }, border: { bg: null } } } });
  const view = index => overlay([changingBacking({ colors: backgrounds[index] }), retainedInput]);
  const harness = createTerminalHarness({ terminalSize });
  const app = defineTui({ init: () => ({ state: 0 }), update: (_state, index) => ({ state: index }), view });
  await harness.runApp(app, async runtime => {
    const focusPath = runtime.frame().focusPath;
    const verify = index => {
      const warm = runtime.frame();
      const cold = renderElementFrame(view(index), terminalSize, { focusPath });
      const backingOnly = renderElementFrame(changingBacking({ colors: backgrounds[index] }), terminalSize);
      assert.deepEqual(warm.cells, cold.cells, 'retained native paint must match a fresh rendering');
      assert.equal(renderFramePlain(warm).includes('A界🙂B'), true);
      assert.equal(warm.cells.filter(cell => cell.continuation).length, 2, 'Unicode wide-cell topology survives');
      for (let column = 1; column <= terminalSize.columns; column++) {
        assert.deepEqual(cellAt(warm, column).style?.bg, cellAt(backingOnly, column).style?.bg,
          `Fresh backing color at column ${column}, including neutral destinations`);
      }
      assert.deepEqual(warm.focusPath, focusPath);
    };
    verify(0);
    for (const index of [1, 0, 1]) {
      await runtime.dispatch(index);
      verify(index);
    }
  });
});


test('a transparent wide glyph retains a single background across its continuation cells', () => {
  const buffer = createFrameBuffer(3, 1);
  buffer.write(1, 1, [span('a', { style: { bg: red } }), span('bc', { style: { bg: green } })]);
  buffer.write(1, 1, [span('界', { style: { bg: null } })]);
  const frame = buffer.snapshot();
  assert.equal(cellAt(frame, 1).text, '界');
  assert.equal(cellAt(frame, 2).continuation, true);
  assert.deepEqual(cellAt(frame, 1).style?.bg, red);
  assert.deepEqual(cellAt(frame, 2).style?.bg, red, 'wide-cell topology uses the leading destination background');
  assert.deepEqual(cellAt(frame, 3).style?.bg, green);
});
