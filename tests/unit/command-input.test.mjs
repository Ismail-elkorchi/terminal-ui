import assert from 'node:assert/strict';
import test from 'node:test';

import { commandInputPresentation, commandInputReducer } from '../../dist/behavior/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import {
  layoutElement,
  renderElementFrame,
  renderFramePlain
} from '../../dist/renderer/index.js';
import { renderElementRegions } from '../../dist/renderer/internal/render.js';
import { button, commandInput } from '../../dist/components/index.js';
import { column, row } from '../../dist/layout/index.js';

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
  assert.equal(selected.selectedSuggestionIndex, 0);

  const accepted = commandInputReducer(selected, { kind: 'acceptSuggestion' });
  assert.deepEqual(accepted.input, { text: 'test --watch', cursor: 12 });
  assert.equal('selectedSuggestionIndex' in accepted, false);
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
  assert.equal(selected.selectedSuggestionIndex, 1);

  const selectedByIndex = commandInputReducer(initial, { kind: 'selectSuggestion', suggestionIndex: 1 });
  assert.equal(selectedByIndex.selectedSuggestionIndex, 1);
  assert.equal(commandInputReducer(initial, { kind: 'selectSuggestion', suggestionIndex: 0 }), initial);

  const accepted = commandInputReducer(selected, { kind: 'acceptSuggestion' });
  assert.deepEqual(accepted.input, { text: 'status', cursor: 6 });

  const manuallyDisabled = commandInputReducer({ ...initial, selectedSuggestionIndex: 0 }, { kind: 'acceptSuggestion' });
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
  assert.equal('selectedSuggestionIndex' in selected, false);

  const accepted = commandInputReducer(selected, { kind: 'acceptSuggestion' });
  assert.deepEqual(accepted.input, { text: 'd', cursor: 1 });
});

test('commandInput projects controlled state and emits semantic actions', async () => {
  const command = {
    input: { text: 'te', cursor: 2, selection: { startOffset: 0, endOffsetExclusive: 1 } },
    history: ['build'],
    historyIndex: 0,
    suggestions: [{ value: 'test', label: 'test' }],
    selectedSuggestionIndex: 0
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
    selection: { startOffset: 0, endOffsetExclusive: 1 },
    suggestions: [{ value: 'test', label: 'test' }],
    selectedSuggestionIndex: 0,
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

test('commandInput component renders prompt, suggestions, cursor, and accessibility', () => {
  const frame = renderElementFrame(
    commandInput({
      id: 'command',
      prompt: '/',
      presentation: { value: 'op', cursor: 2, suggestions: [
        { value: 'open', label: 'open', description: 'Open item' },
        { value: 'options', label: 'options' }
      ], selectedSuggestionIndex: 1 },
      display: 'expanded'
    }),
    { columns: 30, rows: 4 }
  );

  const text = frame.cells.map((cell) => cell.text).join('');
  const input = frame.cells
    .filter((cell) => cell.row === 1)
    .sort((left, right) => left.column - right.column)
    .map((cell) => cell.text)
    .join('');
  assert.match(input, /^\/op/u);
  assert.match(text, /\/op/u);
  assert.match(text, /open · Open item/u);
  assert.match(text, /›/u);
  assert.deepEqual(cursorPosition(frame.cursor), { row: 1, column: 4 });
  assert.equal(frame.accessibility.root.role, 'combobox');
  assert.equal(frame.accessibility.root.value, 'op');
  assert.equal(frame.accessibility.root.children?.[0]?.role, 'listbox');
  assert.equal(frame.accessibility.root.children?.[0]?.children?.[1]?.selected, true);
});

test('commandInput popup anchors suggestions without increasing the input height', () => {
  const command = commandInput({
    id: 'omnibox',
    prompt: '',
    presentation: {
      value: 'exa',
      cursor: 3,
      suggestions: [
        { value: 'https://example.com', label: 'Example', description: 'History' },
        { value: 'https://example.org', label: 'Example.org', description: 'Bookmark' }
      ],
      selectedSuggestionIndex: 0
    },
    display: 'popup',
    maxVisibleSuggestions: 2,
    onAction: (action) => action,
    onSubmit: (value) => ({ value })
  });
  const frame = renderElementFrame(column([command, button({
    id: 'content',
    label: 'Content',
    meta: { focus: { disabled: true } }
  })], {
    sizes: [{ kind: 'fixed', cells: 2 }, { kind: 'fill' }]
  }), { columns: 36, rows: 6 });

  const output = frame.cells.map((cell) => cell.text).join('');
  const accessibleInput = frame.accessibility.root.children?.[0];
  assert.match(output, /exa/u);
  assert.match(output, /Example/u);
  assert.match(output, /History/u);
  assert.equal(accessibleInput?.role, 'combobox');
  assert.equal(accessibleInput?.expanded, true);
  assert.equal(accessibleInput?.controls, 'omnibox:suggestions');
  assert.equal(accessibleInput?.children?.[0]?.role, 'listbox');
});

test('commandInput fills tall bounds while preserving its one-row natural size', () => {
  const element = commandInput({
    id: 'tall-command',
    prompt: '› ',
    presentation: { value: 'open', cursor: 4, suggestions: [] },
    display: 'popup',
    onAction: (action) => ({ action })
  });
  const layout = layoutElement(column([element, button({
    id: 'remaining-content',
    label: 'Content',
    meta: { focus: { disabled: true } }
  })], {
    sizes: [{ kind: 'content' }, { kind: 'fill' }]
  }), { columns: 20, rows: 3 });
  const frame = renderElementFrame(element, { columns: 20, rows: 3 }, { focusPath: ['tall-command'] });
  const regions = renderElementRegions(element, { columns: 20, rows: 3 });
  const target = targetById(regions, 'tall-command:text');
  const paddingRows = frame.cells.filter((cell) =>
    cell.source?.elementId === 'tall-command'
    && cell.source?.partName === 'padding'
  );
  const message = target.message(pointerEvent({
    row: 3,
    column: 7,
    localRow: 3,
    localColumn: 7
  }));

  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 20, height: 1 });
  assert.equal(paddingRows.length, 40);
  assert.deepEqual([...new Set(paddingRows.map((cell) => cell.row))], [1, 3]);
  assert.equal(paddingRows.every((cell) => cell.style?.bg?.token === 'control.background'), true);
  assert.deepEqual(cursorPosition(frame.cursor), { row: 2, column: 7 });
  assert.deepEqual(target.bounds, { row: 1, column: 1, width: 20, height: 3 });
  assert.deepEqual(message?.action, {
    kind: 'pointer',
    action: { kind: 'placeCaret', offset: 4 }
  });
});

test('commandInput generated keys navigate and submit the selected suggestion', async () => {
  const app = defineTui({
    id: 'command-generated-keys',
    init: () => ({
      presentation: {
        value: 'exa',
        cursor: 3,
        suggestions: [
          { value: 'https://one.example', label: 'One' },
          { value: 'https://two.example', label: 'Two' }
        ]
      },
      submitted: null
    }),
    update: (state, message) => message.kind === 'action'
      ? {
          state: {
            ...state,
            presentation: {
              ...state.presentation,
              ...(message.action.kind === 'moveSuggestion'
                ? { selectedSuggestionIndex: message.action.delta > 0 ? 0 : 1 }
                : {})
            }
          }
        }
      : { state: { ...state, submitted: message.value } },
    view: (state) => commandInput({
      id: 'generated-command',
      presentation: state.presentation,
      display: 'popup',
      onAction: (action) => ({ kind: 'action', action }),
      onSubmit: (value) => ({ kind: 'submit', value })
    })
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost() });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'arrowDown',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });
  await runtime.handleInput({
    kind: 'key',
    key: 'enter',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.equal(runtime.state().submitted, 'https://one.example');
  await runtime.dispose();
});

test('commandInput leaves Tab available for focus traversal without suggestions', async () => {
  const app = defineTui({
    id: 'command-tab-traversal',
    init: () => ({ actions: [] }),
    update: (state, action) => ({ state: { actions: [...state.actions, action] } }),
    view: () => row([
      commandInput({
        id: 'command',
        presentation: { value: '', cursor: 0, suggestions: [] },
        onAction: (action) => ({ kind: 'command', action })
      }),
      button({ id: 'next', label: 'Next', onPress: () => ({ kind: 'button' }) })
    ])
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost() });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'tab',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });

  assert.equal(runtime.frame().focusPath?.at(-1), 'next');
  assert.deepEqual(runtime.state().actions, []);
  await runtime.dispose();
});

test('commandInput renders completion preview validation footer match styles and wide cursor position', () => {
  const frame = renderElementFrame(
    commandInput({
      id: 'launcher',
      prompt: '?',
      presentation: { value: 'a🙂', cursor: 'a🙂'.length, selection: { startOffset: 1, endOffsetExclusive: 'a🙂'.length }, suggestions: [
        { value: 'a🙂bc', label: 'a🙂bc', description: 'first match' }
      ], selectedSuggestionIndex: 0 },
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
      ], selectedSuggestionIndex: 0 },
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
    .filter((cell) => cell.row === 2)
    .sort((left, right) => left.column - right.column)
    .map((cell) => cell.text)
    .join('');

  assert.match(firstRow, /^>‹/u);
  assert.match(firstRow, /file\.txt/u);
  assert.doesNotMatch(firstRow, /\/very\/long/u);
  assert.deepEqual(cursorPosition(frame.cursor), { row: 2, column: 18 });
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

test('commandInput renders one prompt without a separate focus marker', () => {
  const explicit = renderElementFrame(commandInput({
    id: 'explicit-prompt',
    prompt: '› ',
    presentation: { value: 'open', cursor: 4, suggestions: [] }
  }), { columns: 16, rows: 1 }, { focusPath: ['explicit-prompt'] });
  const defaultPrompt = renderElementFrame(commandInput({
    id: 'default-prompt',
    presentation: { value: 'open', cursor: 4, suggestions: [] }
  }), { columns: 16, rows: 1 }, { focusPath: ['default-prompt'] });

  assert.equal(renderFramePlain(explicit), '› open');
  assert.equal(renderFramePlain(defaultPrompt), '> open');
  assert.deepEqual(cursorPosition(explicit.cursor), { row: 1, column: 7 });
  assert.deepEqual(cursorPosition(defaultPrompt.cursor), { row: 1, column: 7 });
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
      presentation: { value: 'open file', cursor: 0, selection: { startOffset: 5, endOffsetExclusive: 9 }, suggestions: [
        { value: 'open-file', label: 'Open file', description: 'recent' }
      ], selectedSuggestionIndex: 0 },
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

test('commandInput rejects invalid validation levels at its factory boundary', () => {
  assert.throws(() => commandInput({
    id: 'invalid-validation-level',
    presentation: { value: '', cursor: 0, suggestions: [] },
    validation: { message: 'Invalid', level: 'success' }
  }), /validation level must be info, warning, or error/u);
});
