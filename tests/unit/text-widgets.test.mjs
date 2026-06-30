import assert from 'node:assert/strict';
import test from 'node:test';

import {
  nextSpinnerFrameIndex,
  normalizeSpinnerFrameIndex,
  renderFramePlain,
  renderWidgetFrame,
  spinnerReducer
} from '../../dist/tui/index.js';
import { activityIndicator, commandBar, helpBar, inputField, richText, spinner, textArea, textInput } from '../../dist/widgets/index.js';

test('richText renders sanitized styled segments as plain frame text', () => {
  const frame = renderWidgetFrame(richText({
    id: 'rich',
    segments: [
      { text: 'Build ', style: { fg: { kind: 'theme', token: 'text.muted' } } },
      { text: '\u001B[31mfailed\u001B[0m', style: { fg: { kind: 'theme', token: 'status.error' }, bold: true } }
    ]
  }), { columns: 24, rows: 2 });

  assert.equal(renderFramePlain(frame), 'Build failed');
  assert.equal(frame.accessibility.root.value, 'Build failed');
});

test('textArea renders multiline windows and exposes cursor/accessibility state', () => {
  const frame = renderWidgetFrame(textArea({
    id: 'body',
    value: 'line one\nline two',
    cursor: 'line one\nline'.length,
    selection: { start: 0, end: 4 }
  }), { columns: 20, rows: 3 });

  assert.equal(renderFramePlain(frame), 'line one\nline two');
  assert.deepEqual(frame.cursor, { row: 2, column: 5 });
  assert.equal(frame.accessibility.root.role, 'textbox');
  assert.equal(frame.accessibility.root.description, '2 lines. Selection active.');
  assert.equal(frame.cells.some((cell) => cell.style?.bg?.kind === 'theme' && cell.style.bg.token === 'selection.background'), true);
});

test('text widgets map Unicode cursor positions through the shared text contract', () => {
  const value = 'a🙂界b';
  const textInputFrame = renderWidgetFrame(textInput({
    id: 'unicode-input',
    value,
    cursor: 'a🙂'.length,
    selection: { start: 1, end: 'a🙂'.length }
  }), { columns: 12, rows: 1 }, { focusPath: ['unicode-input'] });
  const inputFieldFrame = renderWidgetFrame(inputField({
    id: 'unicode-field',
    value: 'go🙂'
  }), { columns: 12, rows: 1 }, { focusPath: ['unicode-field'] });
  const commandFrame = renderWidgetFrame(commandBar({
    id: 'unicode-command',
    prompt: '> ',
    value,
    cursor: 'a🙂'.length,
    selection: { start: 1, end: 'a🙂'.length }
  }), { columns: 18, rows: 1 }, { focusPath: ['unicode-command'] });

  assert.deepEqual(textInputFrame.cursor, { row: 1, column: 4 });
  assert.deepEqual(inputFieldFrame.cursor, { row: 1, column: 5 });
  assert.deepEqual(commandFrame.cursor, { row: 1, column: 6 });
  assert.equal(renderFramePlain(commandFrame), '> a🙂界b');
  assert.equal(textInputFrame.cells.some((cell) => cell.style?.bg?.kind === 'theme' && cell.style.bg.token === 'selection.background'), true);
  assert.equal(commandFrame.cells.some((cell) => cell.style?.bg?.kind === 'theme' && cell.style.bg.token === 'selection.background'), true);
});

test('textArea horizontal windows use visual cells without splitting graphemes', () => {
  const frame = renderWidgetFrame(textArea({
    id: 'unicode-area',
    value: 'a🙂界b\nplain',
    cursor: 'a🙂界'.length,
    scroll: { offsetRow: 0, offsetColumn: 3, contentRows: 0, contentColumns: 0, viewportRows: 0, viewportColumns: 0 }
  }), { columns: 3, rows: 2 }, { focusPath: ['unicode-area'] });

  assert.equal(renderFramePlain(frame), '界b\nin');
  assert.deepEqual(frame.cursor, { row: 1, column: 3 });
});

test('helpBar and activityIndicator provide reusable app chrome', () => {
  const helpFrame = renderWidgetFrame(helpBar({
    id: 'help',
    bindings: [
      { key: 'Enter', label: 'open' },
      { key: 'Esc', label: 'close' }
    ]
  }), { columns: 32, rows: 1 });
  const activityFrame = renderWidgetFrame(activityIndicator({
    id: 'activity',
    label: 'Indexing',
    status: 'running'
  }), { columns: 32, rows: 1 });

  assert.equal(renderFramePlain(helpFrame), 'Enter open  Esc close');
  assert.equal(helpFrame.accessibility.root.role, 'status');
  assert.equal(renderFramePlain(activityFrame), 'i Indexing (running)');
  assert.equal(activityFrame.accessibility.root.value, 'i Indexing (running)');
});

test('spinner renders state-driven frames, terminal status, and accessibility state', () => {
  const runningFrame = renderWidgetFrame(spinner({
    id: 'spinner-running',
    label: 'Loading',
    frames: ['a', 'b'],
    frameIndex: 3
  }), { columns: 32, rows: 1 });
  const successFrame = renderWidgetFrame(spinner({
    id: 'spinner-success',
    label: 'Loaded',
    status: 'success',
    frameIndex: 1
  }), { columns: 32, rows: 1 });

  assert.equal(renderFramePlain(runningFrame), 'b Loading');
  assert.equal(runningFrame.accessibility.root.value, 'Loading (running)');
  assert.equal(renderFramePlain(successFrame), '✓ Loaded (success)');
  assert.equal(successFrame.accessibility.root.value, 'Loaded (success)');
});

test('spinner reducer advances frame state without hidden timers', () => {
  assert.equal(normalizeSpinnerFrameIndex(-1, 4), 3);
  assert.equal(nextSpinnerFrameIndex(3, 4), 0);
  assert.deepEqual(
    spinnerReducer({ frameIndex: 0, status: 'running' }, { kind: 'advance' }, { frameCount: 4 }),
    { frameIndex: 1, status: 'running' }
  );
  assert.deepEqual(
    spinnerReducer({ frameIndex: 3, status: 'running' }, { kind: 'reset', frameIndex: -1, status: 'idle' }, { frameCount: 4 }),
    { frameIndex: 3, status: 'idle' }
  );
});
