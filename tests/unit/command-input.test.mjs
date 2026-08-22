import assert from 'node:assert/strict';
import test from 'node:test';

import {
  commandInputPresentation,
  commandInputReducer,
  createCommandInputState,
  prepareCommandSuggestions
} from '../../dist/behavior/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import {
  layoutElement,
  renderElementFrame,
  renderFramePlain
} from '../../dist/renderer/index.js';
import { applyRenderDiff } from '../../dist/renderer/internal/diff-interpreter.js';
import { renderElementRegions } from '../../dist/renderer/internal/render.js';
import { button, commandInput } from '../../dist/components/index.js';
import { ignoreMessage } from '../../dist/component/index.js';
import { column, row } from '../../dist/layout/index.js';

function testCommandInput(options) {
  return commandInput({ meta: { accessibleName: "Command input" },
    onTransition: () => ignoreMessage(),
    ...options,
    presentation: {
      open: options.presentation.suggestions.totalCount > 0,
      ...options.presentation
    }
  });
}

function commandSuggestion(id, text, endOffsetExclusive, options = {}, startOffset = 0) {
  return {
    id,
    completion: {
      range: { startOffset, endOffsetExclusive },
      text
    },
    label: text,
    ...options
  };
}

test('commandInputReducer edits, navigates history, and accepts suggestions', () => {
  const initial = createCommandInputState({
    submissions: ['build', 'test'],
    suggestions: prepareCommandSuggestions([
      commandSuggestion('test-watch', 'test --watch', 1),
      commandSuggestion('test-coverage', 'test --coverage', 1)
    ])
  });

  const typed = commandInputReducer(initial, { kind: 'edit', operation: { kind: 'insert', text: 't' } });
  assert.deepEqual(typed.editor.input, { text: 't', cursor: 1 });
  assert.equal('submissionIndex' in typed, false);

  const previous = commandInputReducer(typed, { kind: 'historyPrevious' });
  assert.deepEqual(previous.editor.input, { text: 'test', cursor: 4 });
  assert.equal(previous.submissionIndex, 1);

  const earlier = commandInputReducer(previous, { kind: 'historyPrevious' });
  assert.deepEqual(earlier.editor.input, { text: 'build', cursor: 5 });
  assert.equal(earlier.submissionIndex, 0);

  const forward = commandInputReducer(earlier, { kind: 'historyNext' });
  const restoredDraft = commandInputReducer(forward, { kind: 'historyNext' });
  assert.deepEqual(restoredDraft.editor.input, { text: 't', cursor: 1 });
  assert.equal('submissionIndex' in restoredDraft, false);

  const refreshed = commandInputReducer(earlier, {
    kind: 'setSuggestions',
    suggestions: prepareCommandSuggestions([
      commandSuggestion('test-watch', 'test --watch', 5),
      commandSuggestion('test-coverage', 'test --coverage', 5)
    ])
  });
  const selected = commandInputReducer(refreshed, { kind: 'moveSuggestion', delta: 1 });
  assert.equal(selected.editor.activeId, 'test-coverage');

  const accepted = commandInputReducer(selected, { kind: 'acceptSuggestion' });
  assert.deepEqual(accepted.editor.input, { text: 'test --coverage', cursor: 15 });
  assert.equal('activeId' in accepted.editor, true);
});

test('commandInputReducer bounds submissions independently from edit history', () => {
  let state = createCommandInputState({
    submissionLimit: 2,
    editHistoryPolicy: { maxEntries: 1, maxRetainedBytes: 100 },
    suggestions: prepareCommandSuggestions([])
  });
  for (const value of ['one', 'two', 'three']) {
    state = commandInputReducer(state, { kind: 'recordSubmission', value });
  }
  assert.deepEqual(state.submissions, ['two', 'three']);
  state = commandInputReducer(state, { kind: 'edit', operation: { kind: 'insert', text: 'draft' } });
  state = commandInputReducer(state, { kind: 'undo' });
  assert.equal(state.editor.input.text, '');
  assert.ok(state.editor.editHistory.retainedBytes <= 100);
});

test('commandInputReducer skips disabled suggestions for selection and acceptance', () => {
  const initial = createCommandInputState({
    suggestions: prepareCommandSuggestions([
      commandSuggestion('deploy', 'deploy', 0, { label: 'Deploy', disabled: true }),
      commandSuggestion('status', 'status', 0, { label: 'Status' }),
      commandSuggestion('destroy', 'destroy', 0, { label: 'Destroy', disabled: true })
    ])
  });

  const selected = commandInputReducer(initial, { kind: 'moveSuggestion', delta: 1 });
  assert.equal(selected.editor.activeId, 'status');

  const selectedById = commandInputReducer(initial, { kind: 'setActiveSuggestion', id: 'status' });
  assert.equal(selectedById.editor.activeId, 'status');
  assert.equal(commandInputReducer(initial, { kind: 'setActiveSuggestion', id: 'deploy' }), initial);

  const accepted = commandInputReducer(selected, { kind: 'acceptSuggestion' });
  assert.deepEqual(accepted.editor.input, { text: 'status', cursor: 6 });

  const manuallyDisabled = commandInputReducer({
    ...initial,
    editor: { ...initial.editor, activeId: 'deploy' }
  }, { kind: 'acceptSuggestion' });
  assert.deepEqual(manuallyDisabled.editor.input, { text: '', cursor: 0 });
});

test('commandInputReducer ignores accept when every suggestion is disabled', () => {
  const initial = createCommandInputState({
    value: 'd',
    suggestions: prepareCommandSuggestions([
      commandSuggestion('deploy', 'deploy', 1, { label: 'Deploy', disabled: true })
    ])
  });

  const selected = commandInputReducer(initial, { kind: 'moveSuggestion', delta: 1 });
  assert.equal('activeId' in selected.editor, false);

  const accepted = commandInputReducer(selected, { kind: 'acceptSuggestion' });
  assert.deepEqual(accepted.editor.input, { text: 'd', cursor: 1 });
});

test('commandInput projects controlled state and separates transitions from submission', async () => {
  const createdCommand = createCommandInputState({
      value: 'te',
      submissions: ['build'],
      suggestions: prepareCommandSuggestions([commandSuggestion('test', 'test', 2)])
    });
  const command = {
    ...createdCommand,
    editor: {
      ...createdCommand.editor,
      input: { text: 'te', cursor: 2, selection: { startOffset: 0, endOffsetExclusive: 1 } },
      activeId: 'test'
    },
    submissionIndex: 0,
  };
  const app = defineTui({
    id: 'command-actions',
    init: () => ({ state: ({ command, messages: [] }) }),
    update: (state, message) => ({ state: { ...state, messages: [...state.messages, message] } }),
    view: (state) => testCommandInput({
      id: 'command',
      presentation: commandInputPresentation(state.command),
      onTransition: (action) => ({ kind: 'action', action }),
      onSubmit: ({ value }) => ({ kind: 'action', action: { kind: 'submit', value } })
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
    open: true,
    selection: { startOffset: 0, endOffsetExclusive: 1 },
    suggestions: prepareCommandSuggestions([commandSuggestion('test', 'test', 2)]),
    activeSuggestionId: 'test',
    submissionIndex: 0
  });
  assert.deepEqual(runtime.state().messages, [
    { kind: 'action', action: { kind: 'edit', operation: { kind: 'insert', text: 'x' } } },
    { kind: 'action', action: { kind: 'edit', operation: { kind: 'insert', text: 'clip' } } },
    { kind: 'action', action: { kind: 'edit', operation: { kind: 'deleteBackward' } } },
    { kind: 'action', action: { kind: 'moveSuggestion', delta: -1 } },
    { kind: 'action', action: { kind: 'acceptSuggestion' } },
    { kind: 'action', action: { kind: 'submit', value: 'test' } },
    { kind: 'action', action: { kind: 'dismissSuggestions', reason: 'escape' } }
  ]);
});

test('commandInput component renders prompt, suggestions, cursor, and accessibility', () => {
  const frame = renderElementFrame(
    testCommandInput({
      id: 'command',
      prompt: '/',
      presentation: { value: 'op', cursor: 2, suggestions: prepareCommandSuggestions([
        commandSuggestion('open', 'open', 2, { description: 'Open item' }),
        commandSuggestion('options', 'options', 2)
      ]), activeSuggestionId: 'options' },
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
  assert.equal(frame.accessibility.root.children?.[0]?.children?.[1]?.current, true);
});

test('commandInput popup anchors suggestions without increasing the input height', () => {
  const command = testCommandInput({
    id: 'omnibox',
    prompt: '',
    presentation: {
      value: 'exa',
      cursor: 3,
      suggestions: prepareCommandSuggestions([
        commandSuggestion('example-com', 'https://example.com', 3, { label: 'Example', description: 'History' }),
        commandSuggestion('example-org', 'https://example.org', 3, { label: 'Example.org', description: 'Bookmark' })
      ]),
      activeSuggestionId: 'example-com'
    },
    display: 'popup',
    maxVisibleSuggestions: 2,
    onTransition: (action) => action
  });
  const frame = renderElementFrame(column([command, button({
    id: 'content',
    label: 'Content',
    disabled: true
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
  assert.equal(accessibleInput?.controls, 'omnibox:popup');
  assert.equal(accessibleInput?.children?.[0]?.role, 'listbox');
});

test('read-only command input rejects pointer suggestion activation', () => {
  const target = targetById(renderElementRegions(commandInput({ meta: { accessibleName: "Command input" },
    id: 'read-only-command',
    presentation: {
      value: 'a',
      cursor: 1,
      open: true,
      suggestions: prepareCommandSuggestions([commandSuggestion('alpha', 'alpha', 1, { label: 'Alpha' })]),
      activeSuggestionId: 'alpha'
    },
    display: 'popup',
    readOnly: true,
    onTransition: (action) => action
  }), { columns: 24, rows: 4 }), 'read-only-command:suggestions:list:option:alpha');
  const event = {
    ...pointerEvent({ row: 2, column: 1, localRow: 1, localColumn: 1 }),
    kind: 'click',
    clickCount: 2
  };

  assert.equal(target.message(event), ignoreMessage());
});

test('commandInput fills tall bounds while preserving its one-row natural size', () => {
  const element = testCommandInput({
    id: 'tall-command',
    prompt: '› ',
    presentation: { value: 'open', cursor: 4, suggestions: prepareCommandSuggestions([]) },
    display: 'popup',
    onTransition: (action) => ({ action })
  });
  const layout = layoutElement(column([element, button({
    id: 'remaining-content',
    label: 'Content',
    disabled: true
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
    init: () => ({ state: ({
      presentation: {
        value: 'exa',
        cursor: 3,
        suggestions: prepareCommandSuggestions([
          commandSuggestion('one', 'https://one.example', 3, { label: 'One' }),
          commandSuggestion('two', 'https://two.example', 3, { label: 'Two' })
        ])
      },
      submitted: null
    }) }),
    update: (state, message) => message.kind === 'action'
      ? {
          state: {
            ...state,
            presentation: {
              ...state.presentation,
              ...(message.action.kind === 'moveSuggestion'
                ? { activeSuggestionId: message.action.delta > 0 ? 'one' : 'two' }
                : {})
            }
          }
        }
      : { state: { ...state, submitted: message.value } },
    view: (state) => testCommandInput({
      id: 'generated-command',
      presentation: state.presentation,
      display: 'popup',
      onTransition: (action) => ({ kind: 'action', action }),
      onSubmit: ({ value }) => ({ kind: 'submit', value })
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
    init: () => ({ state: ({ actions: [] }) }),
    update: (state, action) => ({ state: { actions: [...state.actions, action] } }),
    view: () => row([
      testCommandInput({
        id: 'command',
        presentation: { value: '', cursor: 0, suggestions: prepareCommandSuggestions([]) },
        onTransition: (action) => ({ kind: 'command', action })
      }),
      button({ id: 'next', label: 'Next', onAction: () => ({ kind: 'button' }) })
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

test('commandInput cursor-only keyboard and pointer transitions repaint the committed cursor cells', async () => {
  const app = defineTui({
    id: 'command-cursor-damage',
    init: () => ({
      state: createCommandInputState({
        value: 'abcd',
        suggestions: prepareCommandSuggestions([])
      })
    }),
    update: (state, action) => ({ state: commandInputReducer(state, action) }),
    view: (state) => testCommandInput({
      id: 'command-cursor',
      presentation: commandInputPresentation(state),
      onTransition: (action) => action
    })
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 12, rows: 1 } });
  const runtime = createTuiRuntime({ app, host, input: { mouseReporting: 'drag' } });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'arrowLeft',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });
  assert.equal(runtime.state().editor.input.cursor, 3);

  const pointer = await runtime.handleInputChunk({ data: '\u001B[<0;4;1M' });
  assert.equal(pointer.results[0]?.handled, true);
  assert.equal(runtime.state().editor.input.cursor, 1);

  await runtime.handleInput({
    kind: 'key',
    key: 'backspace',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });
  assert.deepEqual(runtime.state().editor.input, { text: 'bcd', cursor: 0 });

  const frames = host.frames();
  const diffs = host.diffs();
  assert.equal(frames.length, 4);
  assert.equal(diffs.length, frames.length);
  for (let index = 1; index < frames.length; index += 1) {
    const replayed = applyRenderDiff(frames[index - 1], diffs[index]);
    assert.deepEqual(replayed.cells, frames[index].cells);
    assert.deepEqual(replayed.cursor, frames[index].cursor);
    assert.equal(frames[index].cells.filter((cell) => cell.style?.inverse === true).length, 1);
  }

  await runtime.dispose();
});

test('commandInput renders completion preview validation footer match styles and wide cursor position', () => {
  const frame = renderElementFrame(
    testCommandInput({
      id: 'launcher',
      prompt: '?',
      presentation: { value: 'a🙂', cursor: 'a🙂'.length, selection: { startOffset: 1, endOffsetExclusive: 'a🙂'.length }, suggestions: prepareCommandSuggestions([
        commandSuggestion('emoji-match', 'a🙂bc', 'a🙂'.length, { description: 'first match' })
      ]), activeSuggestionId: 'emoji-match' },
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
    ['launcher:popup', undefined]
  ]);
  assert.equal(frame.accessibility.root.children?.[1]?.children?.[0]?.value, 'a🙂bc');
});

test('commandInput stays compact by default even when suggestions are provided', () => {
  const frame = renderElementFrame(
    testCommandInput({
      id: 'compact-command',
      prompt: '/',
      presentation: { value: '', cursor: 0, suggestions: prepareCommandSuggestions([
        commandSuggestion('open', 'open', 0, { description: 'Open item' })
      ]), activeSuggestionId: 'open' },
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
    testCommandInput({
      id: 'long-command',
      prompt: '>',
      presentation: { value, cursor: value.length, suggestions: prepareCommandSuggestions([]) }
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
    testCommandInput({
      id: 'windowed-command',
      prompt: '>',
      presentation: { value: 'abcdef', cursor: 6, suggestions: prepareCommandSuggestions([]) },
      onTransition: (action) => ({ action })
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
  const explicit = renderElementFrame(testCommandInput({
    id: 'explicit-prompt',
    prompt: '› ',
    presentation: { value: 'open', cursor: 4, suggestions: prepareCommandSuggestions([]) }
  }), { columns: 16, rows: 1 }, { focusPath: ['explicit-prompt'] });
  const defaultPrompt = renderElementFrame(testCommandInput({
    id: 'default-prompt',
    presentation: { value: 'open', cursor: 4, suggestions: prepareCommandSuggestions([]) }
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
    testCommandInput({
      id: 'cmd-source',
      prompt: ':',
      presentation: { value: 'open file', cursor: 0, selection: { startOffset: 5, endOffsetExclusive: 9 }, suggestions: prepareCommandSuggestions([
        commandSuggestion('open-file', 'open-file', 9, { label: 'Open file', description: 'recent' }, 5)
      ]), activeSuggestionId: 'open-file' },
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
  assert.throws(() => testCommandInput({
    id: 'invalid-validation-level',
    presentation: { value: '', cursor: 0, suggestions: prepareCommandSuggestions([]) },
    validation: { message: 'Invalid', level: 'success' }
  }), /validation level must be one of info, warning, error/u);
});
