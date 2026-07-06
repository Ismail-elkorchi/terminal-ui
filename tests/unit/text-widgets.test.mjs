import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTerminalCapabilities } from '../../dist/host/index.js';
import {
  nextSpinnerFrameIndex,
  normalizeSpinnerFrameIndex,
  renderFramePlain,
  renderWidgetFrame,
  renderWidgetRegions,
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
  assert.deepEqual(beta?.style, { fg: { kind: 'theme', token: 'status.warning' }, underline: true, bold: true });
  assert.deepEqual(beta?.link, { href: 'https://example.test/beta' });
  assert.deepEqual(beta?.source, { ownerId: 'beta', ownerKind: 'token', role: 'text', label: 'beta' });
  assert.equal(frame.accessibility.root.value, 'Alpha Beta');
});

test('richText gives linked spans the default link style without overriding explicit segment style', () => {
  const frame = renderWidgetFrame(richText({
    id: 'links',
    segments: [
      { text: 'Docs', link: { href: 'https://example.test/docs' } },
      {
        text: ' Warn',
        style: { fg: { kind: 'theme', token: 'status.warning' }, bold: true },
        link: { href: 'https://example.test/warn' }
      }
    ]
  }), { columns: 16, rows: 1 });
  const docs = frame.cells.find((cell) => cell.text === 'D');
  const warn = frame.cells.find((cell) => cell.text === 'W');

  assert.equal(docs?.style?.fg?.token, 'link.foreground');
  assert.equal(docs?.style?.underline, true);
  assert.deepEqual(docs?.link, { href: 'https://example.test/docs' });
  assert.deepEqual(warn?.style, { fg: { kind: 'theme', token: 'status.warning' }, underline: true, bold: true });
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
  assert.equal(frame.cursor?.style?.fg?.token, 'input.cursor');
  assert.equal(frame.cursor?.style?.inverse, true);
  assert.equal(frame.accessibility.root.role, 'textbox');
  assert.equal(
    frame.accessibility.root.description,
    '2 lines. Showing 1-2 of 2 rows. Omitted before: 0. Omitted after: 0. Horizontal offset: 0. Selection active.'
  );
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
    partKind: 'cursor',
    label: 'cursor'
  });
  assert.equal(textInputFrame.cursor?.style?.fg?.token, 'input.cursor');
  assert.equal(commandFrame.cursor?.style?.fg?.token, 'input.cursor');
  assert.equal(commandFrame.cursor?.style?.inverse, true);
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

test('textArea can opt into line number gutter and active line anatomy', () => {
  const frame = renderWidgetFrame(textArea({
    id: 'editor',
    value: 'alpha\nbeta',
    cursor: 'alpha\nb'.length,
    lineNumbers: { minWidth: 2 },
    activeLine: true
  }), { columns: 24, rows: 2 }, { focusPath: ['editor'] });
  const activeContent = frame.cells.find((cell) => cell.row === 2 && cell.text === 'b');

  assert.equal(renderFramePlain(frame), '› 1 │ alpha\n› 2 │ beta');
  assert.deepEqual(cursorPosition(frame.cursor), { row: 2, column: 8 });
  assert.equal(frame.cells.find((cell) => cell.row === 1 && cell.text === '1')?.source?.label, 'lineNumber');
  assert.equal(frame.cells.find((cell) => cell.row === 2 && cell.text === '2')?.source?.label, 'activeLine.lineNumber');
  assert.equal(frame.cells.find((cell) => cell.row === 2 && cell.text === '│')?.source?.label, 'activeLine.gutter');
  assert.equal(activeContent?.source?.label, 'activeLine.value');
  assert.equal(activeContent?.source?.role, 'text');
  assert.equal(activeContent?.style?.fg?.token, 'text.default');
  assert.equal(activeContent?.style?.bg?.token, 'editor.activeLine.background');
  assert.equal(activeContent?.style?.bold, undefined);
  assert.equal(frame.cells.find((cell) => cell.row === 1 && cell.text === '1')?.style?.fg?.token, 'editor.gutter.foreground');
  assert.equal(frame.cells.find((cell) => cell.row === 2 && cell.text === '2')?.style?.fg?.token, 'editor.gutter.active.foreground');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'activeLine.background')?.style?.bg?.token, 'editor.activeLine.background');
});

test('textArea cursor uses the actual line-number gutter width', () => {
  const lines = Array.from({ length: 12 }, (_item, index) => `line ${String(index + 1)}`);
  const value = lines.join('\n');
  const cursor = lines.slice(0, 9).join('\n').length + 1;
  const frame = renderWidgetFrame(textArea({
    id: 'wide-gutter-editor',
    value,
    cursor,
    lineNumbers: true
  }), { columns: 24, rows: 12 }, { focusPath: ['wide-gutter-editor'] });

  assert.equal(renderFramePlain(frame).split('\n')[0], '› 1 │ line 1');
  assert.equal(renderFramePlain(frame).split('\n')[9], '│10 │ line 10');
  assert.deepEqual(cursorPosition(frame.cursor), { row: 10, column: 7 });
  assert.equal(frame.cells.find((cell) => cell.row === 10 && cell.text === 'l')?.column, 7);
});

test('textArea renders caller-owned highlight ranges without overriding selection', () => {
  const frame = renderWidgetFrame(textArea({
    id: 'searchable',
    value: 'alpha beta gamma',
    selection: { start: 0, end: 5 },
    highlights: [
      { start: 6, end: 10, label: 'search.match' },
      { start: 11, end: 16, label: 'custom.match', style: { fg: { kind: 'theme', token: 'status.warning' }, bold: true } }
    ]
  }), { columns: 24, rows: 1 });
  const selected = frame.cells.find((cell) => cell.text === 'a');
  const highlighted = frame.cells.find((cell) => cell.text === 'b');
  const custom = frame.cells.find((cell) => cell.text === 'g');

  assert.equal(renderFramePlain(frame), '› alpha beta gamma');
  assert.equal(selected?.source?.partKind, 'selection');
  assert.equal(selected?.style?.bg?.token, 'selection.background');
  assert.equal(highlighted?.source?.partKind, 'highlight');
  assert.equal(highlighted?.source?.label, 'search.match');
  assert.equal(highlighted?.style?.fg?.token, 'menu.match');
  assert.equal(highlighted?.style?.underline, true);
  assert.equal(custom?.source?.label, 'custom.match');
  assert.equal(custom?.style?.fg?.token, 'status.warning');
  assert.equal(custom?.style?.bold, true);
});

test('textArea can soft-wrap long logical lines while preserving editor anatomy', () => {
  const frame = renderWidgetFrame(textArea({
    id: 'wrapped-editor',
    value: 'alpha beta gamma',
    cursor: 'alpha beta'.length,
    lineNumbers: { minWidth: 2 },
    activeLine: true,
    wrap: true
  }), { columns: 12, rows: 3 }, { focusPath: ['wrapped-editor'] });

  assert.equal(renderFramePlain(frame), '› 1 │ alpha\n›   │ beta g\n›   │ amma');
  assert.deepEqual(cursorPosition(frame.cursor), { row: 2, column: 11 });
  assert.equal(frame.cells.find((cell) => cell.row === 1 && cell.text === '1')?.source?.label, 'activeLine.lineNumber');
  assert.equal(frame.cells.find((cell) => cell.row === 2 && cell.text === '│')?.source?.label, 'activeLine.gutter');
  assert.equal(
    frame.accessibility.root.description,
    '1 lines. Showing 1-3 of 3 rows. Omitted before: 0. Omitted after: 0. Horizontal offset: 0.'
  );
});

test('wrapped textArea exposes scrollbar scope over visual rows', () => {
  const frame = renderWidgetFrame(textArea({
    id: 'wrapped-scroll',
    value: 'alpha beta gamma delta',
    wrap: true,
    scroll: { offsetRow: 1, offsetColumn: 0, contentRows: 0, contentColumns: 0, viewportRows: 0, viewportColumns: 0 },
    scrollbar: { visible: 'always', axis: 'vertical' }
  }), { columns: 9, rows: 2 });

  assert.equal(renderFramePlain(frame), '› beta g┃\n│ amma d│');
  assert.equal(frame.cells.find((cell) => cell.text === '┃')?.source?.ownerKind, 'textArea');
  assert.equal(
    frame.accessibility.root.description,
    '1 lines. Showing 2-3 of 4 rows. Omitted before: 1. Omitted after: 1. Horizontal offset: 0.'
  );
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

test('textInput maps pointer positions to text offsets when opted in', () => {
  const regions = renderWidgetRegions(textInput({
    id: 'editable-input',
    value: 'alpha',
    toTextPointerMessage: (event) => ({ event })
  }), { columns: 16, rows: 1 });
  const target = targetById(regions, 'editable-input:text');
  const message = target.message(pointerEvent({
    kind: 'pointerDown',
    row: 1,
    column: 6,
    localRow: 1,
    localColumn: 6
  }));

  assert.deepEqual(message?.event.action, 'placeCursor');
  assert.equal(message?.event.offset, 2);
});

test('disabled textInput suppresses opted-in text pointer targets', () => {
  const frame = renderWidgetFrame(textInput({
    id: 'disabled-editable-input',
    value: 'locked',
    disabled: true,
    toTextPointerMessage: (event) => ({ event })
  }), { columns: 16, rows: 1 });

  assert.deepEqual(frame.hitTargets ?? [], []);
});

test('textArea maps pointer positions through gutters visual rows and selection drag actions', () => {
  const regions = renderWidgetRegions(textArea({
    id: 'editable-area',
    value: 'alpha\nbeta',
    lineNumbers: true,
    toTextPointerMessage: (event) => ({ event })
  }), { columns: 24, rows: 2 });
  const target = targetById(regions, 'editable-area:text');
  const place = target.message(pointerEvent({
    kind: 'pointerDown',
    row: 2,
    column: 8,
    localRow: 2,
    localColumn: 8
  }));
  const drag = target.message(pointerEvent({
    kind: 'drag',
    row: 2,
    column: 9,
    localRow: 2,
    localColumn: 9
  }));

  assert.equal(place?.event.action, 'placeCursor');
  assert.equal(place?.event.offset, 8);
  assert.equal(drag?.event.action, 'extendSelection');
  assert.equal(drag?.event.offset, 9);
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
  assert.equal(
    frame.accessibility.root.description,
    '2 lines. Showing 1-2 of 2 rows. Omitted before: 0. Omitted after: 0. Horizontal offset: 3.'
  );
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
  kind,
  row,
  column,
  localRow,
  localColumn
}) {
  return {
    kind,
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
      action: kind === 'pointerDown' ? 'press' : 'drag',
      button: 'left',
      row,
      column,
      rawCode: kind === 'pointerDown' ? 0 : 32,
      modifiers: { shift: false, alt: false, ctrl: false }
    }
  };
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

test('helpBar keeps compact bindings whole instead of clipping partial labels', () => {
  const frame = renderWidgetFrame(helpBar({
    id: 'help-compact',
    bindings: [
      { key: 'click', label: 'select/open file' },
      { key: 'disclosure', label: 'toggle folder' },
      { key: 'enter', label: 'open/toggle' }
    ]
  }), { columns: 26, rows: 1 });

  assert.equal(renderFramePlain(frame), 'click select/open file  …');
  assert.doesNotMatch(renderFramePlain(frame), /dis/u);
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
