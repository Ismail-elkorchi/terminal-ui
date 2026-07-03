import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTerminalCapabilities } from '../../dist/host/index.js';
import {
  nextSpinnerFrameIndex,
  normalizeSpinnerFrameIndex,
  renderFramePlain,
  renderWidgetFrame,
  spinnerReducer
} from '../../dist/tui/index.js';
import { highContrastTheme } from '../../dist/theme/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import { activityIndicator, commandBar, helpBar, numberInput, richText, spinner, stack, text, textArea, textInput } from '../../dist/widgets/index.js';

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
  assert.deepEqual(frame.cells.find((cell) => cell.text === 'B')?.source, textSource('rich', 'richText', 'segment.0', {
    part: 'segment',
    itemIndex: 0
  }));
});

test('text renders through shared role styles and source metadata', () => {
  const frame = renderWidgetFrame(text('Danger', {
    id: 'danger-text',
    textRole: 'danger',
    styles: {
      root: { underline: true }
    }
  }), { columns: 12, rows: 1 });
  const first = frame.cells.find((cell) => cell.text === 'D');

  assert.deepEqual(first?.style, {
    fg: { kind: 'theme', token: 'status.error' },
    bold: true,
    underline: true
  });
  assert.deepEqual(first?.source, textSource('danger-text', 'text', 'role.danger', { part: 'role.danger' }));
  assert.equal(frame.accessibility.root.value, 'Danger');
});

test('wrapped richText preserves segment style link and source metadata', () => {
  const frame = renderWidgetFrame(richText({
    id: 'rich-wrap',
    wrap: true,
    segments: [
      {
        text: 'Alpha ',
        style: { fg: { kind: 'theme', token: 'status.success' } },
        source: { ownerId: 'alpha', ownerKind: 'token', role: 'text', label: 'alpha' }
      },
      {
        text: 'Beta',
        style: { fg: { kind: 'theme', token: 'status.warning' }, bold: true },
        link: { href: 'https://example.test/beta' },
        source: { ownerId: 'beta', ownerKind: 'token', role: 'text', label: 'beta' }
      }
    ]
  }), { columns: 6, rows: 2 });
  const beta = frame.cells.find((cell) => cell.text === 'B');

  assert.equal(renderFramePlain(frame), 'Alpha\nBeta');
  assert.deepEqual(frame.cells.find((cell) => cell.text === 'A')?.style, { fg: { kind: 'theme', token: 'status.success' } });
  assert.deepEqual(beta?.style, { fg: { kind: 'theme', token: 'status.warning' }, bold: true });
  assert.deepEqual(beta?.link, { href: 'https://example.test/beta' });
  assert.deepEqual(beta?.source, { ownerId: 'beta', ownerKind: 'token', role: 'text', label: 'beta' });
  assert.equal(frame.accessibility.root.value, 'Alpha Beta');
});

test('textArea renders multiline windows and exposes cursor/accessibility state', () => {
  const frame = renderWidgetFrame(textArea({
    id: 'body',
    value: 'line one\nline two',
    cursor: 'line one\nline'.length,
    selection: { start: 0, end: 4 }
  }), { columns: 20, rows: 3 });

  assert.equal(renderFramePlain(frame), '› line one\n│ line two');
  assert.deepEqual(cursorPosition(frame.cursor), { row: 2, column: 7 });
  assert.equal(frame.accessibility.root.role, 'textbox');
  assert.equal(frame.accessibility.root.description, '2 lines. Selection active.');
  assert.equal(frame.cells.some((cell) => cell.style?.bg?.kind === 'theme' && cell.style.bg.token === 'selection.background'), true);
});

test('editable text controls expose source metadata for chrome value placeholder and selection', () => {
  const inputFrame = renderWidgetFrame(textInput({
    id: 'email',
    value: 'abc',
    selection: { start: 1, end: 2 }
  }), { columns: 12, rows: 1 });
  const placeholderFrame = renderWidgetFrame(textInput({
    id: 'empty',
    value: '',
    placeholder: 'Email'
  }), { columns: 12, rows: 1 });
  const numberFrame = renderWidgetFrame(numberInput({
    id: 'qty',
    value: 42
  }), { columns: 12, rows: 1 });

  assert.equal(inputFrame.cells.find((cell) => cell.text === '[')?.source?.label, 'chrome.prefix');
  assert.equal(inputFrame.cells.find((cell) => cell.text === 'a')?.source?.label, 'value');
  assert.equal(inputFrame.cells.find((cell) => cell.text === 'b')?.source?.label, 'selection');
  assert.equal(inputFrame.cells.find((cell) => cell.text === ']')?.source?.label, 'chrome.suffix');
  assert.equal(inputFrame.cells.find((cell) => cell.text === 'b')?.source?.ownerId, 'email');
  assert.equal(placeholderFrame.cells.find((cell) => cell.text === 'E')?.source?.label, 'placeholder');
  assert.equal(numberFrame.cells.find((cell) => cell.text === '4')?.source?.ownerKind, 'numberInput');
  assert.equal(numberFrame.cells.find((cell) => cell.text === '4')?.source?.label, 'value');
});

test('text widgets map Unicode cursor positions through the shared text contract', () => {
  const value = 'a🙂界b';
  const textInputFrame = renderWidgetFrame(textInput({
    id: 'unicode-input',
    value,
    cursor: 'a🙂'.length,
    selection: { start: 1, end: 'a🙂'.length }
  }), { columns: 12, rows: 1 }, { focusPath: ['unicode-input'] });
  const secondaryInputFrame = renderWidgetFrame(textInput({
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

  assert.deepEqual(cursorPosition(textInputFrame.cursor), { row: 1, column: 7 });
  assert.deepEqual(cursorPosition(secondaryInputFrame.cursor), { row: 1, column: 8 });
  assert.deepEqual(cursorPosition(commandFrame.cursor), { row: 1, column: 6 });
  assert.deepEqual(textInputFrame.cursor?.source, formSource('unicode-input', 'textInput', 'cursor'));
  assert.deepEqual(secondaryInputFrame.cursor?.source, formSource('unicode-field', 'textInput', 'cursor'));
  assert.deepEqual(commandFrame.cursor?.source, {
    ownerId: 'unicode-command',
    ownerKind: 'commandBar',
    family: 'command',
    role: 'cursor',
    part: 'cursor',
    label: 'cursor'
  });
  assert.equal(renderFramePlain(textInputFrame), '›[ a🙂界b ]');
  assert.equal(renderFramePlain(secondaryInputFrame), '›[ go🙂 ]');
  assert.equal(renderFramePlain(commandFrame), '> a🙂界b');
  assert.equal(textInputFrame.cells.some((cell) => cell.style?.bg?.kind === 'theme' && cell.style.bg.token === 'selection.background'), true);
  assert.equal(commandFrame.cells.some((cell) => cell.style?.bg?.kind === 'theme' && cell.style.bg.token === 'selection.background'), true);
});

test('textArea editable cells expose chrome value placeholder and selection source metadata', () => {
  const selectedFrame = renderWidgetFrame(textArea({
    id: 'notes',
    value: 'alpha\nbeta',
    selection: { start: 1, end: 4 }
  }), { columns: 12, rows: 2 });
  const placeholderFrame = renderWidgetFrame(textArea({
    id: 'notes-empty',
    value: '',
    placeholder: 'Write notes'
  }), { columns: 12, rows: 1 });

  assert.equal(selectedFrame.cells.find((cell) => cell.text === '›')?.source?.label, 'chrome.prefix');
  assert.equal(selectedFrame.cells.find((cell) => cell.text === 'a')?.source?.label, 'value');
  assert.equal(selectedFrame.cells.find((cell) => cell.text === 'l')?.source?.label, 'selection');
  assert.equal(selectedFrame.cells.find((cell) => cell.row === 2 && cell.text === 'b')?.source?.label, 'value');
  assert.equal(placeholderFrame.cells.find((cell) => cell.text === 'W')?.source?.label, 'placeholder');
});

test('editable text controls remain readable in high contrast and no-color projections', () => {
  const widget = stack([
    textInput({
      id: 'contrast-input',
      value: 'alpha',
      selection: { start: 1, end: 4 },
      error: 'Invalid value'
    }),
    commandBar({
      id: 'contrast-command',
      prompt: '/',
      value: '',
      placeholder: 'command',
      validation: { tone: 'warning', message: 'Waiting' }
    })
  ]);
  const frame = renderWidgetFrame(widget, { columns: 28, rows: 3 }, {
    theme: highContrastTheme,
    focusPath: ['contrast-input']
  });
  const highContrast = createVisualSnapshot({
    frame,
    ansi: { capabilities: colorCapabilities(), theme: highContrastTheme }
  });
  const noColor = createVisualSnapshot({
    frame,
    ansi: { capabilities: noColorCapabilities(), theme: highContrastTheme }
  });

  assert.match(highContrast.plainTextFrame, /x\[ alpha \]/u);
  assert.match(highContrast.plainTextFrame, /\/command/u);
  assert.match(highContrast.ansiFrame, /\\x1b\[/u);
  assert.match(highContrast.frameJson, /"label": "selection"/u);
  assert.match(highContrast.frameJson, /"label": "validation"/u);
  assert.doesNotMatch(noColor.ansiFrame, /\\x1b\[[0-9;]*m/u);
  assert.equal(noColor.plainTextFrame, highContrast.plainTextFrame);
});

test('disabled textInput exposes no mouse hit target', () => {
  const frame = renderWidgetFrame(textInput({
    id: 'disabled-input',
    value: 'locked',
    disabled: true,
    message: { kind: 'submit' }
  }), { columns: 16, rows: 1 });

  assert.deepEqual(frame.hitTargets ?? [], []);
});

test('textArea horizontal windows use visual cells without splitting graphemes', () => {
  const frame = renderWidgetFrame(textArea({
    id: 'unicode-area',
    value: 'a🙂界b\nplain',
    cursor: 'a🙂界'.length,
    scroll: { offsetRow: 0, offsetColumn: 3, contentRows: 0, contentColumns: 0, viewportRows: 0, viewportColumns: 0 }
  }), { columns: 5, rows: 2 }, { focusPath: ['unicode-area'] });

  assert.equal(renderFramePlain(frame), '› 界b\n│ in');
  assert.deepEqual(cursorPosition(frame.cursor), { row: 1, column: 5 });
  assert.deepEqual(frame.cursor?.source, formSource('unicode-area', 'textArea', 'cursor'));
});

function cursorPosition(cursor) {
  return cursor === undefined ? undefined : { row: cursor.row, column: cursor.column };
}

function textSource(ownerId, ownerKind, label, extra = {}) {
  return {
    ownerId,
    ownerKind,
    family: 'text',
    role: 'text',
    label,
    ...extra
  };
}

function formSource(ownerId, ownerKind, label) {
  return {
    ownerId,
    ownerKind,
    family: 'form',
    role: 'cursor',
    part: label,
    partKind: 'cursor',
    label
  };
}

function colorCapabilities() {
  return resolveTerminalCapabilities({
    host: {
      runtime: 'memory',
      inputIsTty: true,
      outputIsTty: true,
      rawInput: true
    }
  });
}

function noColorCapabilities() {
  return {
    ...colorCapabilities(),
    color: {
      depth: 0,
      hasBasicColors: false,
      has256Colors: false,
      hasTrueColor: false
    }
  };
}

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
