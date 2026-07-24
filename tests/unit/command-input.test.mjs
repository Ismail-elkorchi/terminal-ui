import assert from 'node:assert/strict';
import test from 'node:test';

import { commandInputPresentation, commandInputReducer } from '../../dist/behavior/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import {
  renderElementFrame
} from '../../dist/renderer/index.js';
import { renderElementRegions } from '../../dist/testing/index.js';
import { commandInput } from '../../dist/components/index.js';

test('commandInputReducer edits, navigates history, and accepts suggestions', () => {
  const initial = {
    input: { text: '', cursor: 0 },
    history: ['build', 'test'],
    suggestions: [
      { value: 'test --watch', label: 'test --watch' },
      { value: 'test --coverage', label: 'test --coverage' }
    ]
  };

  const typed = commandInputReducer(initial, { kind: 'edit', operation: { kind: 'insert', text: 't' } });
  assert.deepEqual(typed.input, { text: 't', cursor: 1 });
  assert.equal('historyIndex' in typed, false);

  const previous = commandInputReducer(typed, { kind: 'historyPrevious' });
  assert.deepEqual(previous.input, { text: 'test', cursor: 4 });
  assert.equal(previous.historyIndex, 1);

  const earlier = commandInputReducer(previous, { kind: 'historyPrevious' });
  assert.deepEqual(earlier.input, { text: 'build', cursor: 5 });
  assert.equal(earlier.historyIndex, 0);

  const selected = commandInputReducer(earlier, { kind: 'moveSuggestion', delta: 1 });
  assert.equal(selected.selectedSuggestion, 0);

  const accepted = commandInputReducer(selected, { kind: 'acceptSuggestion' });
  assert.deepEqual(accepted.input, { text: 'test --watch', cursor: 12 });
  assert.equal('selectedSuggestion' in accepted, false);
});

test('commandInputReducer skips disabled suggestions for selection and acceptance', () => {
  const initial = {
    input: { text: '', cursor: 0 },
    history: [],
    suggestions: [
      { value: 'deploy', label: 'Deploy', disabled: true },
      { value: 'status', label: 'Status' },
      { value: 'destroy', label: 'Destroy', disabled: true }
    ]
  };

  const selected = commandInputReducer(initial, { kind: 'moveSuggestion', delta: 1 });
  assert.equal(selected.selectedSuggestion, 1);

  const selectedByIndex = commandInputReducer(initial, { kind: 'selectSuggestion', index: 1 });
  assert.equal(selectedByIndex.selectedSuggestion, 1);
  assert.equal(commandInputReducer(initial, { kind: 'selectSuggestion', index: 0 }), initial);

  const accepted = commandInputReducer(selected, { kind: 'acceptSuggestion' });
  assert.deepEqual(accepted.input, { text: 'status', cursor: 6 });

  const manuallyDisabled = commandInputReducer({ ...initial, selectedSuggestion: 0 }, { kind: 'acceptSuggestion' });
  assert.deepEqual(manuallyDisabled.input, { text: '', cursor: 0 });
});

test('commandInputReducer ignores accept when every suggestion is disabled', () => {
  const initial = {
    input: { text: 'd', cursor: 1 },
    history: [],
    suggestions: [
      { value: 'deploy', label: 'Deploy', disabled: true }
    ]
  };

  const selected = commandInputReducer(initial, { kind: 'moveSuggestion', delta: 1 });
  assert.equal('selectedSuggestion' in selected, false);

  const accepted = commandInputReducer(selected, { kind: 'acceptSuggestion' });
  assert.deepEqual(accepted.input, { text: 'd', cursor: 1 });
});

test('commandInput projects controlled state and emits semantic actions', async () => {
  const command = {
    input: { text: 'te', cursor: 2, selection: { start: 0, end: 1 } },
    history: ['build'],
    historyIndex: 0,
    suggestions: [{ value: 'test', label: 'test' }],
    selectedSuggestion: 0
  };
  const app = defineTui({
    id: 'command-actions',
    init: () => ({ command, messages: [] }),
    update: (state, message) => ({ state: { ...state, messages: [...state.messages, message] } }),
    view: (state) => commandInput({
      id: 'command',
      presentation: commandInputPresentation(state.command),
      onAction: (action) => ({ kind: 'action', action }),
      onSubmit: () => ({ kind: 'submit' }),
      keys: {
        arrowUp: () => ({ kind: 'history' }),
        tab: () => ({ kind: 'suggestion' }),
        escape: () => ({ kind: 'escape' })
      }
    })
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost() });

  await runtime.start();
  await runtime.handleInput({ kind: 'text', text: 'x', paste: false });
  await runtime.handleInput({ kind: 'paste', text: 'clip', bracketed: true });
  await runtime.handleInput({ kind: 'key', key: 'backspace', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  await runtime.handleInput({ kind: 'key', key: 'arrowUp', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  await runtime.handleInput({ kind: 'key', key: 'tab', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  await runtime.handleInput({ kind: 'key', key: 'enter', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  await runtime.handleInput({ kind: 'key', key: 'escape', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });

  assert.deepEqual(commandInputPresentation(command), {
    value: 'te',
    cursor: 2,
    selection: { start: 0, end: 1 },
    suggestions: [{ value: 'test', label: 'test' }],
    selectedSuggestion: 0,
    historyIndex: 0
  });
  assert.deepEqual(runtime.state().messages, [
    { kind: 'action', action: { kind: 'edit', operation: { kind: 'insert', text: 'x' } } },
    { kind: 'action', action: { kind: 'edit', operation: { kind: 'insert', text: 'clip' } } },
    { kind: 'action', action: { kind: 'edit', operation: { kind: 'deleteBackward' } } },
    { kind: 'history' },
    { kind: 'suggestion' },
    { kind: 'submit' },
    { kind: 'escape' }
  ]);
});

test('commandInput widget renders prompt, suggestions, cursor, and accessibility', () => {
  const frame = renderElementFrame(
    commandInput({
      id: 'command',
      prompt: '/',
      presentation: { value: 'op', cursor: 2, suggestions: [
        { value: 'open', label: 'open', description: 'Open item' },
        { value: 'options', label: 'options' }
      ], selectedSuggestion: 1 },
      display: 'expanded'
    }),
    { columns: 30, rows: 4 }
  );

  const text = frame.cells.map((cell) => cell.text).join('');
  assert.match(text, /\/op/u);
  assert.match(text, /open · Open item/u);
  assert.match(text, /›/u);
  assert.deepEqual(cursorPosition(frame.cursor), { row: 1, column: 4 });
  assert.equal(frame.accessibility.root.role, 'combobox');
  assert.equal(frame.accessibility.root.value, 'op');
  assert.equal(frame.accessibility.root.children?.[0]?.role, 'listbox');
  assert.equal(frame.accessibility.root.children?.[0]?.children?.[1]?.selected, true);
});

test('commandInput renders completion preview validation footer match styles and wide cursor position', () => {
  const frame = renderElementFrame(
    commandInput({
      id: 'launcher',
      prompt: '?',
      presentation: { value: 'a🙂', cursor: 'a🙂'.length, selection: { start: 1, end: 'a🙂'.length }, suggestions: [
        { value: 'a🙂bc', label: 'a🙂bc', description: 'first match' }
      ], selectedSuggestion: 0 },
      completionPreview: 'bc',
      validation: { message: 'Choose a value', level: 'warning' },
      footer: 'enter accepts',
      display: 'expanded'
    }),
    { columns: 32, rows: 4 }
  );

  const output = frame.cells.map((cell) => cell.text).join('');
  const previewCell = frame.cells.find((cell) => cell.row === 1 && cell.text === 'c');
  const selectedCell = frame.cells.find((cell) => cell.row === 1 && cell.text === '🙂');
  const validationCell = frame.cells.find((cell) => cell.row === 2 && cell.text === 'C');
  const matchCell = frame.cells.find((cell) => cell.row === 3 && cell.text === 'a');

  assert.match(output, /\?a🙂bc/u);
  assert.match(output, /Choose a value/u);
  assert.match(output, /enter accepts/u);
  assert.deepEqual(cursorPosition(frame.cursor), { row: 1, column: 5 });
  assert.equal(previewCell?.style?.fg?.token, 'input.placeholder');
  assert.equal(selectedCell?.style?.bg?.token, 'selection.background');
  assert.equal(validationCell?.style?.fg?.token, 'status.warning');
  assert.equal(matchCell?.style?.fg?.token, 'command.match');
  assert.deepEqual(frame.accessibility.root.children?.map((node) => [node.id, node.value]), [
    ['launcher:validation', 'Choose a value'],
    ['launcher:suggestions', undefined]
  ]);
  assert.equal(frame.accessibility.root.children?.[1]?.children?.[0]?.value, 'a🙂bc');
});

test('commandInput stays compact by default even when suggestions are provided', () => {
  const frame = renderElementFrame(
    commandInput({
      id: 'compact-command',
      prompt: '/',
      presentation: { value: '', cursor: 0, suggestions: [
        { value: 'open', label: 'open', description: 'Open item' }
      ], selectedSuggestion: 0 },
      placeholder: 'Type a command',
      footer: 'Enter run'
    }),
    { columns: 32, rows: 5 }
  );

  const output = frame.cells.map((cell) => cell.text).join('');
  assert.match(output, /Type a command/u);
  assert.doesNotMatch(output, /Open item/u);
  assert.doesNotMatch(output, /Enter run/u);
  assert.equal(frame.accessibility.root.children, undefined);
});

test('commandInput windows long input around the cursor', () => {
  const value = '/open /very/long/path/to/file.txt';
  const frame = renderElementFrame(
    commandInput({
      id: 'long-command',
      prompt: '>',
      presentation: { value, cursor: value.length, suggestions: [] }
    }),
    { columns: 18, rows: 3 }
  );

  const firstRow = frame.cells
    .filter((cell) => cell.row === 1)
    .sort((left, right) => left.column - right.column)
    .map((cell) => cell.text)
    .join('');

  assert.match(firstRow, /^>‹/u);
  assert.match(firstRow, /file\.txt/u);
  assert.doesNotMatch(firstRow, /\/very\/long/u);
  assert.deepEqual(cursorPosition(frame.cursor), { row: 1, column: 18 });
});

test('commandInput maps pointer positions through the cursor-relative input window', () => {
  const regions = renderElementRegions(
    commandInput({
      id: 'windowed-command',
      prompt: '>',
      presentation: { value: 'abcdef', cursor: 6, suggestions: [] },
      onAction: (action) => ({ action })
    }),
    { columns: 5, rows: 1 }
  );
  const target = targetById(regions, 'windowed-command:text');
  const message = target.message(pointerEvent({
    row: 1,
    column: 3,
    localRow: 1,
    localColumn: 3
  }));

  assert.deepEqual(message?.action, {
    kind: 'pointer',
    action: { kind: 'placeCaret', offset: 4 }
  });
});

function cursorPosition(cursor) {
  return cursor === undefined ? undefined : { row: cursor.row, column: cursor.column };
}

function targetById(regions, id) {
  const target = regions.flatMap((region) => region.hitTargets).find((current) => current.id === id);
  assert.ok(target, `expected hit target ${id}`);
  return target;
}

function pointerEvent({
  row,
  column,
  localRow,
  localColumn
}) {
  return {
    kind: 'pointerDown',
    source: 'mouse',
    row,
    column,
    localRow,
    localColumn,
    button: 'left',
    modifiers: { shift: false, alt: false, ctrl: false },
    deltaRows: 0,
    deltaColumns: 0,
    targetId: 'target',
    raw: {
      kind: 'mouse',
      sequence: '',
      encoding: 'sgr',
      action: 'press',
      button: 'left',
      row,
      column,
      rawCode: 0,
      modifiers: { shift: false, alt: false, ctrl: false }
    }
  };
}

test('commandInput exposes prompt value selection suggestion validation and footer source metadata', () => {
  const frame = renderElementFrame(
    commandInput({
      id: 'cmd-source',
      prompt: ':',
      presentation: { value: 'open file', cursor: 0, selection: { start: 5, end: 9 }, suggestions: [
        { value: 'open-file', label: 'Open file', description: 'recent' }
      ], selectedSuggestion: 0 },
      completionPreview: 's',
      validation: { level: 'warning', message: 'Needs target' },
      footer: 'Enter run',
      display: 'expanded'
    }),
    { columns: 48, rows: 5 },
    { focusPath: ['cmd-source'] }
  );

  assert.equal(frame.cells.find((cell) => cell.text === ':')?.source?.description, 'prompt');
  assert.equal(frame.cells.find((cell) => cell.text === ':')?.source?.partType, 'prompt');
  assert.equal(frame.cells.find((cell) => cell.text === 'o')?.source?.description, 'value');
  assert.equal(frame.cells.find((cell) => cell.text === 'o')?.source?.partType, 'value');
  assert.equal(frame.cells.find((cell) => cell.text === 'f')?.source?.description, 'selection');
  assert.equal(frame.cells.find((cell) => cell.text === 'f')?.source?.partType, 'selection');
  assert.equal(frame.cells.find((cell) => cell.row === 1 && cell.text === 's')?.source?.description, 'completion');
  assert.equal(frame.cells.find((cell) => cell.row === 1 && cell.text === 's')?.source?.partType, 'completion');
  assert.equal(frame.cells.find((cell) => cell.text === 'N')?.source?.description, 'validation');
  assert.equal(frame.cells.find((cell) => cell.text === 'N')?.source?.partType, 'validation');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'suggestion.0.marker')?.text, '›');
  assert.equal(frame.cells.find((cell) => cell.text === 'O')?.source?.description, 'suggestion.0.match');
  assert.equal(frame.cells.find((cell) => cell.text === 'O')?.source?.partType, 'match');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'suggestion.0.description')?.text, ' ');
  assert.equal(frame.cells.find((cell) => cell.text === 'E')?.source?.description, 'footer');
  assert.equal(frame.cells.find((cell) => cell.text === 'E')?.source?.partType, 'footer');
});
