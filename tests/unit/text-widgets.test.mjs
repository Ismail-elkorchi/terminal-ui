import assert from 'node:assert/strict';
import test from 'node:test';

import {
  nextSpinnerFrameIndex,
  normalizeSpinnerFrameIndex,
  spinnerReducer
} from '../../dist/behavior/index.js';
import {
  resolveTerminalCapabilities } from '../../dist/host/index.js';
import {
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  highContrastTheme } from '../../dist/theme/index.js';
import { createVisualSnapshot, renderElementRegions } from '../../dist/testing/index.js';
import { statusIndicator,
  commandInput,
  helpBar,
  numberInput,
  richText,
  spinner,
  text,
  textArea,
  textInput
} from '../../dist/components/index.js';
import { column } from '../../dist/layout/index.js';
import {
  prepareTextDocument,
  textCaretAt,
  textDocumentSelectionBetween
} from '../../dist/text/index.js';

test('richText renders sanitized styled segments as plain frame text', () => {
  const frame = renderElementFrame(richText({
    id: 'rich',
    segments: [
      { kind: 'text', text: 'Build ', style: { fg: { kind: 'theme', token: 'text.muted' } } },
      { kind: 'text', text: '\u001B[31mfailed\u001B[0m', style: { fg: { kind: 'theme', token: 'status.error' }, bold: true } }
    ]
  }), { columns: 24, rows: 2 });

  assert.equal(renderFramePlain(frame), 'Build failed');
  assert.equal(frame.accessibility.root.value, 'Build failed');
  assert.deepEqual(frame.cells.find((cell) => cell.text === 'B')?.source, textSource('rich', 'richText', 'segment.0', {
    partName: 'segment',
    itemIndex: 0
  }));
});

test('text renders through shared role styles and source metadata', () => {
  const frame = renderElementFrame(text('Badge', {
    id: 'badge-text',
    textRole: 'badge',
    meta: {
        styles: {
            root: { underline: true }
        }
    }
}), { columns: 12, rows: 1 });
  const first = frame.cells.find((cell) => cell.text === 'B');

  assert.deepEqual(first?.style, {
    fg: { kind: 'theme', token: 'badge.foreground' },
    bg: { kind: 'theme', token: 'badge.background' },
    bold: true,
    underline: true
  });
  assert.deepEqual(first?.source, textSource('badge-text', 'text', 'role.badge', { partName: 'role.badge' }));
  assert.equal(frame.accessibility.root.value, 'Badge');
});

test('wrapped richText preserves segment style link and source metadata', () => {
  const frame = renderElementFrame(richText({
    id: 'rich-wrap',
    wrap: true,
    segments: [
      {
        kind: 'text',
        text: 'Alpha ',
        style: { fg: { kind: 'theme', token: 'status.success' } }
      },
      {
        kind: 'text',
        text: 'Beta',
        style: { fg: { kind: 'theme', token: 'status.warning' }, bold: true },
        link: { href: 'https://example.test/beta' }
      }
    ]
  }), { columns: 6, rows: 2 });
  const beta = frame.cells.find((cell) => cell.text === 'B');

  assert.equal(renderFramePlain(frame), 'Alpha\nBeta');
  assert.deepEqual(frame.cells.find((cell) => cell.text === 'A')?.style, { fg: { kind: 'theme', token: 'status.success' } });
  assert.deepEqual(beta?.style, { fg: { kind: 'theme', token: 'status.warning' }, underline: true, bold: true });
  assert.deepEqual(beta?.link, { href: 'https://example.test/beta' });
  assert.deepEqual(beta?.source, textSource('rich-wrap', 'richText', 'segment.1', {
    partName: 'segment',
    itemIndex: 1
  }));
  assert.equal(frame.accessibility.root.value, 'Alpha Beta');
});

test('richText gives linked spans the default link style without overriding explicit segment style', () => {
  const frame = renderElementFrame(richText({
    id: 'links',
    segments: [
      { kind: 'text', text: 'Docs', link: { href: 'https://example.test/docs' } },
      {
        kind: 'text',
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
  const frame = renderElementFrame(textArea({
    id: 'body',
    presentation: {
      document: prepareTextDocument('line one\nline two'),
      caret: textCaretAt('line one\nline'.length),
      selection: textDocumentSelectionBetween(0, 4)
    },
  }), { columns: 20, rows: 3 });

  assert.equal(renderFramePlain(frame), '› line one\n│ line two');
  assert.deepEqual(cursorPosition(frame.cursor), { row: 2, column: 7 });
  assert.equal(frame.cursor?.style?.fg?.token, 'input.cursor');
  assert.equal(frame.cursor?.style?.inverse, true);
  const caretCell = frame.cells.find((cell) => cell.row === frame.cursor?.row && cell.column === frame.cursor.column);
  assert.equal(caretCell?.style?.inverse, true);
  assert.equal(caretCell?.source?.description, 'value');
  assert.equal(frame.accessibility.root.role, 'textbox');
  assert.equal(
    frame.accessibility.root.description,
    '2 lines. Showing 1-2 of 2 rows. Omitted before: 0. Omitted after: 0. Horizontal offset: 0. Selection active.'
  );
  assert.equal(frame.cells.some((cell) => cell.style?.bg?.kind === 'theme' && cell.style.bg.token === 'selection.background'), true);
});

test('editable text controls expose source metadata for chrome value placeholder and selection', () => {
  const inputFrame = renderElementFrame(textInput({
    id: 'email',
    presentation: { value: 'abc', cursor: 0, selection: { start: 1, end: 2 } },
  }), { columns: 12, rows: 1 });
  const placeholderFrame = renderElementFrame(textInput({
    id: 'empty',
    presentation: { value: '', cursor: 0 },
    placeholder: 'Email'
  }), { columns: 12, rows: 1 });
  const numberFrame = renderElementFrame(numberInput({
    id: 'qty',
    presentation: { value: '42', cursor: 2, validity: 'valid', parsedValue: 42 }
  }), { columns: 12, rows: 1 });

  assert.equal(inputFrame.cells.find((cell) => cell.text === '[')?.source?.description, 'chrome.prefix');
  assert.equal(inputFrame.cells.find((cell) => cell.text === 'a')?.source?.description, 'value');
  assert.equal(inputFrame.cells.find((cell) => cell.text === 'b')?.source?.description, 'selection');
  assert.equal(inputFrame.cells.find((cell) => cell.text === ']')?.source?.description, 'chrome.suffix');
  assert.equal(inputFrame.cells.find((cell) => cell.text === 'b')?.source?.elementId, 'email');
  assert.equal(placeholderFrame.cells.find((cell) => cell.text === 'E')?.source?.description, 'placeholder');
  assert.equal(numberFrame.cells.find((cell) => cell.text === '4')?.source?.elementKind, 'numberInput');
  assert.equal(numberFrame.cells.find((cell) => cell.text === '4')?.source?.description, 'value');
});

test('text widgets map Unicode cursor positions through the shared text contract', () => {
  const value = 'a🙂界b';
  const textInputFrame = renderElementFrame(textInput({
    id: 'unicode-input',
    presentation: { value, cursor: 'a🙂'.length, selection: { start: 1, end: 'a🙂'.length } }
  }), { columns: 12, rows: 1 }, { focusPath: ['unicode-input'] });
  const secondaryInputFrame = renderElementFrame(textInput({
    id: 'unicode-field',
    presentation: { value: 'go🙂', cursor: 'go🙂'.length }
  }), { columns: 12, rows: 1 }, { focusPath: ['unicode-field'] });
  const commandFrame = renderElementFrame(commandInput({
    id: 'unicode-command',
    prompt: '> ',
    presentation: { value, cursor: 'a🙂'.length, selection: { start: 1, end: 'a🙂'.length }, suggestions: [] }
  }), { columns: 18, rows: 1 }, { focusPath: ['unicode-command'] });

  assert.deepEqual(cursorPosition(textInputFrame.cursor), { row: 1, column: 7 });
  assert.deepEqual(cursorPosition(secondaryInputFrame.cursor), { row: 1, column: 8 });
  assert.deepEqual(cursorPosition(commandFrame.cursor), { row: 1, column: 6 });
  assert.deepEqual(textInputFrame.cursor?.source, formSource('unicode-input', 'textInput', 'cursor'));
  assert.deepEqual(secondaryInputFrame.cursor?.source, formSource('unicode-field', 'textInput', 'cursor'));
  assert.deepEqual(commandFrame.cursor?.source, {
    elementId: 'unicode-command',
    elementKind: 'commandInput',
    rendererFamily: 'command',
    cellRole: 'cursor',
    partName: 'cursor',
    partType: 'cursor',
    description: 'cursor'
  });
  assert.equal(textInputFrame.cursor?.style?.fg?.token, 'input.cursor');
  assert.equal(commandFrame.cursor?.style?.fg?.token, 'input.cursor');
  assert.equal(commandFrame.cursor?.style?.inverse, true);
  assert.equal(textInputFrame.cells.find((cell) => cell.column === textInputFrame.cursor?.column)?.style?.inverse, true);
  assert.equal(commandFrame.cells.find((cell) => cell.column === commandFrame.cursor?.column)?.style?.inverse, true);
  assert.equal(renderFramePlain(textInputFrame), '›[ a🙂界b ]');
  assert.equal(renderFramePlain(secondaryInputFrame), '›[ go🙂 ]');
  assert.equal(renderFramePlain(commandFrame), '> a🙂界b');
  assert.equal(textInputFrame.cells.some((cell) => cell.style?.bg?.kind === 'theme' && cell.style.bg.token === 'selection.background'), true);
  assert.equal(commandFrame.cells.some((cell) => cell.style?.bg?.kind === 'theme' && cell.style.bg.token === 'selection.background'), true);
});

test('textArea editable cells expose chrome value placeholder and selection source metadata', () => {
  const selectedFrame = renderElementFrame(textArea({
    id: 'notes',
    presentation: {
      document: prepareTextDocument('alpha\nbeta'),
      caret: textCaretAt(0),
      selection: textDocumentSelectionBetween(1, 4)
    },
  }), { columns: 12, rows: 2 });
  const placeholderFrame = renderElementFrame(textArea({
    id: 'notes-empty',
    presentation: { document: prepareTextDocument(''), caret: textCaretAt(0) },
    placeholder: 'Write notes'
  }), { columns: 12, rows: 1 });

  assert.equal(selectedFrame.cells.find((cell) => cell.text === '›')?.source?.description, 'chrome.prefix');
  assert.equal(selectedFrame.cells.find((cell) => cell.text === 'a')?.source?.description, 'value');
  assert.equal(selectedFrame.cells.find((cell) => cell.text === 'l')?.source?.description, 'selection');
  assert.equal(selectedFrame.cells.find((cell) => cell.row === 2 && cell.text === 'b')?.source?.description, 'value');
  assert.equal(placeholderFrame.cells.find((cell) => cell.text === 'W')?.source?.description, 'placeholder');
  assert.equal(placeholderFrame.accessibility.root.value, '');
});

test('textArea can opt into line number gutter and active line anatomy', () => {
  const frame = renderElementFrame(textArea({
    id: 'editor',
    presentation: { document: prepareTextDocument('alpha\nbeta'), caret: textCaretAt('alpha\nb'.length) },
    lineNumbers: { minWidth: 2 },
    activeLine: true
  }), { columns: 24, rows: 2 }, { focusPath: ['editor'] });
  const activeContent = frame.cells.find((cell) => cell.row === 2 && cell.text === 'b');

  assert.equal(renderFramePlain(frame), '› 1 │ alpha\n› 2 │ beta');
  assert.deepEqual(cursorPosition(frame.cursor), { row: 2, column: 8 });
  assert.equal(frame.cells.find((cell) => cell.row === 1 && cell.text === '1')?.source?.description, 'lineNumber');
  assert.equal(frame.cells.find((cell) => cell.row === 2 && cell.text === '2')?.source?.description, 'activeLine.lineNumber');
  assert.equal(frame.cells.find((cell) => cell.row === 2 && cell.text === '│')?.source?.description, 'activeLine.gutter');
  assert.equal(activeContent?.source?.description, 'activeLine.value');
  assert.equal(activeContent?.source?.cellRole, 'text');
  assert.equal(activeContent?.style?.fg?.token, 'text.default');
  assert.equal(activeContent?.style?.bg?.token, 'editor.activeLine.background');
  assert.equal(activeContent?.style?.bold, undefined);
  assert.equal(frame.cells.find((cell) => cell.row === 1 && cell.text === '1')?.style?.fg?.token, 'editor.gutter.foreground');
  assert.equal(frame.cells.find((cell) => cell.row === 2 && cell.text === '2')?.style?.fg?.token, 'editor.gutter.active.foreground');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'activeLine.background')?.style?.bg?.token, 'editor.activeLine.background');
});

test('textArea cursor uses the actual line-number gutter width', () => {
  const lines = Array.from({ length: 12 }, (_item, index) => `line ${String(index + 1)}`);
  const value = lines.join('\n');
  const cursor = lines.slice(0, 9).join('\n').length + 1;
  const frame = renderElementFrame(textArea({
    id: 'wide-gutter-editor',
    presentation: { document: prepareTextDocument(value), caret: textCaretAt(cursor) },
    lineNumbers: true
  }), { columns: 24, rows: 12 }, { focusPath: ['wide-gutter-editor'] });

  assert.equal(renderFramePlain(frame).split('\n')[0], '› 1 │ line 1');
  assert.equal(renderFramePlain(frame).split('\n')[9], '│10 │ line 10');
  assert.deepEqual(cursorPosition(frame.cursor), { row: 10, column: 7 });
  assert.equal(frame.cells.find((cell) => cell.row === 10 && cell.text === 'l')?.column, 7);
});

test('textArea renders caller-controlled highlight ranges without overriding selection', () => {
  const frame = renderElementFrame(textArea({
    id: 'searchable',
    presentation: {
      document: prepareTextDocument('alpha beta gamma'),
      caret: textCaretAt(0),
      selection: textDocumentSelectionBetween(0, 5)
    },
    highlights: [
      { start: 6, end: 10, label: 'search.match' },
      { start: 11, end: 16, label: 'custom.match', style: { fg: { kind: 'theme', token: 'status.warning' }, bold: true } }
    ]
  }), { columns: 24, rows: 1 });
  const selected = frame.cells.find((cell) => cell.text === 'a');
  const highlighted = frame.cells.find((cell) => cell.text === 'b');
  const custom = frame.cells.find((cell) => cell.text === 'g');

  assert.equal(renderFramePlain(frame), '› alpha beta gamma');
  assert.equal(selected?.source?.partType, 'selection');
  assert.equal(selected?.style?.bg?.token, 'selection.background');
  assert.equal(highlighted?.source?.partType, 'highlight');
  assert.equal(highlighted?.source?.description, 'search.match');
  assert.equal(highlighted?.style?.fg?.token, 'menu.match');
  assert.equal(highlighted?.style?.underline, true);
  assert.equal(custom?.source?.description, 'custom.match');
  assert.equal(custom?.style?.fg?.token, 'status.warning');
  assert.equal(custom?.style?.bold, true);
});

test('textArea can soft-wrap long logical lines while preserving editor anatomy', () => {
  const frame = renderElementFrame(textArea({
    id: 'wrapped-editor',
    presentation: { document: prepareTextDocument('alpha beta gamma'), caret: textCaretAt('alpha beta'.length) },
    lineNumbers: { minWidth: 2 },
    activeLine: true,
    wrap: true
  }), { columns: 12, rows: 3 }, { focusPath: ['wrapped-editor'] });

  assert.equal(renderFramePlain(frame), '› 1 │ alpha\n›   │ beta g\n›   │ amma');
  assert.deepEqual(cursorPosition(frame.cursor), { row: 2, column: 11 });
  assert.equal(frame.cells.find((cell) => cell.row === 1 && cell.text === '1')?.source?.description, 'activeLine.lineNumber');
  assert.equal(frame.cells.find((cell) => cell.row === 2 && cell.text === '│')?.source?.description, 'activeLine.gutter');
  assert.equal(
    frame.accessibility.root.description,
    '1 lines. Showing 1-3 of 3 rows. Omitted before: 0. Omitted after: 0. Horizontal offset: 0.'
  );
});

test('wrapped textArea exposes scrollbar scope over visual rows', () => {
  const frame = renderElementFrame(textArea({
    id: 'wrapped-scroll',
    presentation: { document: prepareTextDocument('alpha beta gamma delta'), caret: textCaretAt(0), scroll: { offsetRow: 1, offsetColumn: 0, contentRows: 0, contentColumns: 0, viewportRows: 0, viewportColumns: 0 } },
    wrap: true,
    scrollbar: { visible: 'always', axis: 'vertical' }
  }), { columns: 9, rows: 2 });

  assert.equal(renderFramePlain(frame), '› beta g┃\n│ amma d│');
  assert.equal(frame.cells.find((cell) => cell.text === '┃')?.source?.elementKind, 'textArea');
  assert.equal(
    frame.accessibility.root.description,
    '1 lines. Showing 2-3 of 4 rows. Omitted before: 1. Omitted after: 1. Horizontal offset: 0.'
  );
});

test('editable text controls remain readable in high contrast and no-color projections', () => {
  const widget = column([
    textInput({
      id: 'contrast-input',
      presentation: { value: 'alpha', cursor: 0, selection: { start: 1, end: 4 } },
      error: 'Invalid value'
    }),
    commandInput({
      id: 'contrast-command',
      prompt: '/',
      presentation: { value: '', cursor: 0, suggestions: [] },
      placeholder: 'command',
      validation: { level: 'warning', message: 'Waiting' }
    })
  ]);
  const frame = renderElementFrame(widget, { columns: 28, rows: 3 }, {
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
  assert.match(highContrast.frameJson, /"description": "selection"/u);
  assert.match(highContrast.frameJson, /"description": "validation"/u);
  assert.doesNotMatch(noColor.ansiFrame, /\\x1b\[[0-9;]*m/u);
  assert.equal(noColor.plainTextFrame, highContrast.plainTextFrame);
});

test('disabled textInput exposes no mouse hit target', () => {
  const frame = renderElementFrame(textInput({
    id: 'disabled-input',
    presentation: { value: 'locked', cursor: 0 },
    disabled: true,
    onSubmit: () => ({ kind: 'submit' })
  }), { columns: 16, rows: 1 });

  assert.deepEqual(frame.hitTargets ?? [], []);
});

test('textInput maps pointer positions to text offsets when opted in', () => {
  const regions = renderElementRegions(textInput({
    id: 'editable-input',
    presentation: { value: 'alpha', cursor: 0 },
    onAction: (action) => ({ action })
  }), { columns: 16, rows: 1 });
  const target = targetById(regions, 'editable-input:text');
  const message = target.message(pointerEvent({
    kind: 'pointerDown',
    row: 1,
    column: 6,
    localRow: 1,
    localColumn: 6
  }));

  assert.deepEqual(message?.action, {
    kind: 'pointer',
    action: { kind: 'placeCaret', offset: 2 }
  });
});

test('disabled textInput suppresses opted-in text pointer targets', () => {
  const frame = renderElementFrame(textInput({
    id: 'disabled-editable-input',
    presentation: { value: 'locked', cursor: 0 },
    disabled: true,
    onAction: (action) => ({ action })
  }), { columns: 16, rows: 1 });

  assert.deepEqual(frame.hitTargets ?? [], []);
});

test('textArea maps pointer positions through gutters visual rows and selection drag actions', () => {
  const regions = renderElementRegions(textArea({
    id: 'editable-area',
    presentation: { document: prepareTextDocument('alpha\nbeta'), caret: textCaretAt(0) },
    lineNumbers: true,
    onAction: (action) => ({ action })
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
    localColumn: 9,
    pressRow: 2,
    pressColumn: 8,
    pressLocalRow: 2,
    pressLocalColumn: 8
  }));
  const dragEnd = target.message(pointerEvent({
    kind: 'dragEnd',
    row: 2,
    column: 10,
    localRow: 2,
    localColumn: 10,
    pressRow: 2,
    pressColumn: 8,
    pressLocalRow: 2,
    pressLocalColumn: 8
  }));

  assert.deepEqual(place?.action, {
    kind: 'pointer',
    action: { kind: 'placeCaret', offset: 8 }
  });
  assert.deepEqual(drag?.action, {
    kind: 'pointer',
    action: { kind: 'extendSelection', anchor: 8, offset: 9 }
  });
  assert.deepEqual(dragEnd?.action, {
    kind: 'pointer',
    action: { kind: 'endSelection', anchor: 8, offset: 10 }
  });
});

test('textArea horizontal windows use visual cells without splitting graphemes', () => {
  const frame = renderElementFrame(textArea({
    id: 'unicode-area',
    presentation: { document: prepareTextDocument('a🙂界b\nplain'), caret: textCaretAt('a🙂界'.length), scroll: { offsetRow: 0, offsetColumn: 3, contentRows: 0, contentColumns: 0, viewportRows: 0, viewportColumns: 0 } },
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
  localColumn,
  pressRow,
  pressColumn,
  pressLocalRow,
  pressLocalColumn
}) {
  return {
    kind,
    source: 'mouse',
    row,
    column,
    localRow,
    localColumn,
    ...(pressRow === undefined ? {} : { pressRow }),
    ...(pressColumn === undefined ? {} : { pressColumn }),
    ...(pressLocalRow === undefined ? {} : { pressLocalRow }),
    ...(pressLocalColumn === undefined ? {} : { pressLocalColumn }),
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

function textSource(elementId, elementKind, label, extra = {}) {
  return {
    elementId,
    elementKind,
    rendererFamily: 'text',
    cellRole: 'text',
    description: label,
    ...extra
  };
}

function formSource(elementId, elementKind, label) {
  return {
    elementId,
    elementKind,
    rendererFamily: 'form',
    cellRole: 'cursor',
    partName: label,
    partType: 'cursor',
    description: label
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

test('helpBar and statusIndicator provide reusable app chrome', () => {
  const helpFrame = renderElementFrame(helpBar({
    id: 'help',
    groups: [{
      id: 'primary',
      bindings: [
        { key: 'Enter', label: 'open' },
        { key: 'Esc', label: 'close' }
      ]
    }]
  }), { columns: 32, rows: 1 });
  const activityFrame = renderElementFrame(statusIndicator({
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
  const frame = renderElementFrame(helpBar({
    id: 'help-compact',
    groups: [{
      id: 'primary',
      bindings: [
        { key: 'click', label: 'select/open file' },
        { key: 'disclosure', label: 'toggle folder' },
        { key: 'enter', label: 'open/toggle' }
      ]
    }]
  }), { columns: 26, rows: 1 });

  assert.equal(renderFramePlain(frame), 'click select/open file  …');
  assert.doesNotMatch(renderFramePlain(frame), /dis/u);
});

test('spinner renders state-driven frames, terminal status, and accessibility state', () => {
  const runningFrame = renderElementFrame(spinner({
    id: 'spinner-running',
    label: 'Loading',
    frames: ['a', 'b'],
    frameIndex: 3
  }), { columns: 32, rows: 1 });
  const successFrame = renderElementFrame(spinner({
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
