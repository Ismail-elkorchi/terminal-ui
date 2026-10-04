import assert from 'node:assert/strict';
import test from 'node:test';
import { textInput, passwordInput, numberInput, combobox, commandInput, searchPicker } from '../../../dist/components/index.js';
import { textInputReducer, createCommandInputState, createCommandSuggestions, commandInputView, createSearchPickerIndex, createSearchPickerState, searchPickerView, querySearchPickerIndex } from '../../../dist/behavior/index.js';
import { defineTextPresentation } from '../../../dist/text/index.js';
import { renderElementFrame, renderFramePlain, diffFrames } from '../../../dist/renderer/index.js';
import { renderElementRegions } from '../../../dist/renderer/internal/render-element.js';
import { applyRenderDiff, fullRewriteDiffFromFrame } from '../../../dist/renderer/internal/diff-interpreter.js';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';
import { createOptionsFixture } from '../../support/collection-fixtures.mjs';

const logical = 'abאב12';
const presentation = defineTextPresentation({ map(request) {
  const fixture = request.text === logical ? [0, 1, 4, 5, 3, 2] : request.graphemes.map(g => g.startOffset);
  return fixture.flatMap(offset => {
    const g = request.graphemes.find(cluster => cluster.startOffset === offset);
    return g === undefined ? [] : [{ ...g, direction: request.text === logical && (offset === 2 || offset === 3) ? 'rtl' : 'ltr' }];
  });
} });
const size = { columns: 20, rows: 4 };
const state = { text: logical, cursor: 2, affinity: 'downstream', selection: { startOffset: 2, endOffsetExclusive: 4 } };
const meta = { accessibleName: 'Mapped field' };
const onTransition = action => action;

function pointer(target, column) {
  return target.message({ kind: 'pointerDown', button: 'left', row: target.bounds.row, column: target.bounds.column + column - 1,
    localRow: 1, localColumn: column, modifiers: { ctrl: false, alt: false, shift: false, meta: false } });
}

function controls() {
  const commandState = createCommandInputState({ value: logical, cursor: 2, suggestions: createCommandSuggestions([]) });
  const searchIndex = createSearchPickerIndex([]);
  const query = { text: logical, mode: 'contains' };
  const result = querySearchPickerIndex(searchIndex, query);
  const pickerState = createSearchPickerState({ query, queryResult: result }, searchIndex);
  return [
    ['text', textInput({ id: 'text', meta, state, onTransition }), 'text:text', 2],
    ['number', numberInput({ id: 'number', meta, view: { value: logical, cursor: 2, affinity: 'downstream', validity: 'invalid', selection: state.selection }, onTransition }), 'number:input', 2],
    ['combo', combobox({ id: 'combo', label: '', labelVisibility: 'hidden', ...createOptionsFixture([]), view: {
      kind: 'autocomplete', open: false, input: state, selection: { mode: 'single' },
    }, onTransition }), 'combo:trigger', 0],
    ['command', commandInput({ id: 'command', meta, prompt: '', view: { ...commandInputView(commandState), input: state }, onTransition }), 'command:text', 0],
    ['picker', searchPicker({ id: 'picker', meta, searchPickerIndex: searchIndex, queryResult: result,
      view: { ...searchPickerView(pickerState), input: state }, onTransition }), 'picker:query', 2],
  ];
}

for (const [name, element, targetId, prefix] of controls()) {
  test(`${name} shares visual paint, source selection, caret affinity, and inverse pointer geometry`, () => {
    const options = { textPresentation: presentation, focusPath: [name] };
    const frame = renderElementFrame(element, size, options);
    assert.match(renderFramePlain(frame), /ab12בא/u);
    const selected = frame.cells.filter(cell => cell.source?.partType === 'selection' && !cell.continuation);
    assert.equal(selected.map(cell => cell.text).join(''), 'בא');
    assert.equal(frame.cursor.column, prefix + 7);
    const target = renderElementRegions(element, size, options).flatMap(region => region.hitTargets).find(hit => hit.id === targetId);
    assert.ok(target);
    const action = pointer(target, prefix + 5);
    assert.deepEqual(action, { kind: 'pointer', transition: { kind: 'placeCaret', offset: 4, affinity: 'upstream' } });
    assert.equal(frame.accessibility.root.value === logical || JSON.stringify(frame.accessibility).includes(logical), true);
  });
}

test('password mapping sees only masks and returns source grapheme boundaries', () => {
  const seen = [];
  const maskedPresentation = defineTextPresentation({ map(request) {
    seen.push(request.text);
    return request.graphemes.map(g => ({ ...g, direction: 'ltr' }));
  } });
  const element = passwordInput({ id: 'password', meta, state: { text: 'א\u05B7🙂بَ', cursor: 2 }, onTransition });
  const options = { textPresentation: maskedPresentation, focusPath: ['password'] };
  const frame = renderElementFrame(element, size, options);
  assert.match(renderFramePlain(frame), /•••/u);
  assert.ok(seen.every(text => !/[אب🙂]/u.test(text)));
  const target = renderElementRegions(element, size, options).flatMap(region => region.hitTargets).find(hit => hit.id === 'password:text');
  assert.deepEqual(pointer(target, 5), { kind: 'pointer', transition: { kind: 'placeCaret', offset: 4, affinity: 'downstream' } });
});

test('visual keyboard movement and shift selection edit the original logical buffer', async () => {
  const runtime = createTuiRuntime({ textPresentation: presentation,
    host: createMemoryTerminalHost({ terminalSize: size }),
    app: defineTui({ init: () => ({ state: { text: logical, cursor: 2, affinity: 'downstream' } }),
      update: (buffer, action) => ({ state: textInputReducer(buffer, action) }),
      view: buffer => textInput({ id: 'field', meta, state: buffer, onTransition }),
    }),
  });
  await runtime.start();
  const key = (name, shift = false) => ({ kind: 'key', key: name, modifiers: { ctrl: false, alt: false, meta: false, shift }, eventType: 'press', location: 'standard' });
  await runtime.handleInput(key('arrowLeft', true));
  assert.deepEqual(runtime.state(), { text: logical, cursor: 3, affinity: 'upstream', selection: { startOffset: 2, endOffsetExclusive: 3 } });
  assert.equal(runtime.frame().cursor.column, 8);
  await runtime.handleInput({ kind: 'text', text: 'x', paste: false });
  assert.equal(runtime.state().text, 'abxב12');
  assert.equal(runtime.state().cursor, 3);
  await runtime.dispose();
});

test('clipped mapped fields repaint identically with incremental and full-frame output', () => {
  const options = { textPresentation: presentation, focusPath: ['field'] };
  const make = cursor => renderElementFrame(textInput({ id: 'field', meta, state: { text: logical, cursor }, onTransition }), { columns: 7, rows: 1 }, options);
  const before = make(0);
  const after = make(2);
  assert.equal(renderFramePlain(after), '› ‹12בא');
  const replay = applyRenderDiff(before, diffFrames(before, after));
  const full = applyRenderDiff(undefined, fullRewriteDiffFromFrame(after));
  assert.deepEqual(replay.cells, full.cells);
  assert.deepEqual(replay.cursor, full.cursor);
});

test('single-line CtrlRight and CtrlLeft retain physical direction for pure RTL words', async () => {
  const rtl = defineTextPresentation({ map(request) {
    return request.graphemes.toReversed().map(g => ({ ...g, direction: 'rtl' }));
  } });
  const runtime = createTuiRuntime({ textPresentation: rtl,
    host: createMemoryTerminalHost({ terminalSize: size }),
    app: defineTui({ init: () => ({ state: { text: 'אב גד', cursor: 5 } }),
      update: (buffer, action) => ({ state: textInputReducer(buffer, action) }),
      view: buffer => textInput({ id: 'field', meta, state: buffer, onTransition }),
    }),
  });
  await runtime.start();
  const key = name => ({ kind: 'key', key: name, modifiers: { ctrl: true, alt: false, meta: false, shift: false }, eventType: 'press', location: 'standard' });
  await runtime.handleInput(key('arrowRight'));
  assert.deepEqual(runtime.state(), { text: 'אב גד', cursor: 3, affinity: 'downstream' });
  await runtime.handleInput(key('arrowLeft'));
  assert.deepEqual(runtime.state(), { text: 'אב גד', cursor: 5, affinity: 'upstream' });
  await runtime.dispose();
});

test('typing at a mixed-run boundary keeps the caret on the inserted glyph trailing edge', async () => {
  const mixed = defineTextPresentation({ map(request) {
    const split = request.text.indexOf('א');
    if (split < 0) return request.graphemes.map(g => ({ ...g, direction: 'ltr' }));
    return [...request.graphemes.filter(g => g.startOffset < split).map(g => ({ ...g, direction: 'ltr' })),
      ...request.graphemes.filter(g => g.startOffset >= split).toReversed().map(g => ({ ...g, direction: 'rtl' }))];
  } });
  const runtime = createTuiRuntime({ textPresentation: mixed,
    host: createMemoryTerminalHost({ terminalSize: size }),
    app: defineTui({ init: () => ({ state: { text: 'abcאבג', cursor: 3, affinity: 'upstream' } }),
      update: (buffer, action) => ({ state: textInputReducer(buffer, action) }),
      view: buffer => textInput({ id: 'field', meta, state: buffer, onTransition }),
    }),
  });
  await runtime.start();
  const before = runtime.frame().cursor.column;
  await runtime.handleInput({ kind: 'text', text: 'X', paste: false });
  assert.deepEqual(runtime.state(), { text: 'abcXאבג', cursor: 4, affinity: 'upstream' });
  assert.equal(runtime.frame().cursor.column, before + 1);
  await runtime.dispose();
});

test('visual arrows traverse an expanded tab as one source grapheme without getting stuck', async () => {
  const identity = defineTextPresentation({ map(request) {
    return request.graphemes.map(g => ({ ...g, direction: 'ltr' }));
  } });
  const runtime = createTuiRuntime({ textPresentation: identity,
    host: createMemoryTerminalHost({ terminalSize: size }),
    app: defineTui({ init: () => ({ state: { text: 'a\tb', cursor: 1 } }),
      update: (buffer, action) => ({ state: textInputReducer(buffer, action) }),
      view: buffer => textInput({ id: 'field', meta, state: buffer, onTransition }),
    }),
  });
  await runtime.start();
  const key = name => ({ kind: 'key', key: name, modifiers: { ctrl: false, alt: false, meta: false, shift: false }, eventType: 'press', location: 'standard' });
  await runtime.handleInput(key('arrowRight'));
  assert.deepEqual(runtime.state(), { text: 'a\tb', cursor: 2, affinity: 'upstream' });
  await runtime.handleInput(key('arrowLeft'));
  assert.deepEqual(runtime.state(), { text: 'a\tb', cursor: 1, affinity: 'downstream' });
  await runtime.dispose();
});
