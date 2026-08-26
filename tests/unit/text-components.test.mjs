import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveTerminalCapabilities } from '../../dist/host/index.js';
import {
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  highContrastTheme,
  noColorTheme
} from '../../dist/theme/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import { prepareCommandSuggestions } from '../../dist/behavior/index.js';
import { renderElementRegions } from '../../dist/renderer/internal/render.js';
import { activityIndicator,
  commandInput as createCommandInput,
  disclosure,
  helpBar,
  numberInput as createNumberInput,
  richText,
  text,
  createTextAreaRowOffsetMap,
  textArea as createTextArea,
  textInput as createTextInput
} from '../../dist/components/index.js';
import { column, surface } from '../../dist/layout/index.js';
import {
  prepareTextDocument,
  textCaretAt,
  textDocumentSelectionBetween,
  textDocumentText
} from '../../dist/text/index.js';

test('enabled disclosure requires its action boundary during construction', () => {
  assert.throws(() => disclosure({
    id: 'dead-disclosure',
    label: 'Details',
    expanded: false,
    slots: { content: text({ content: 'Details' }) }
  }), /requires onAction to map its semantic actions/u);
});

function textInput(options) {
  return createTextInput(
    options.disabled === true
      ? options
      : { onAction: (action) => action, ...options }
  );
}

function numberInput(options) {
  return createNumberInput(
    options.disabled === true
      ? options
      : { onAction: (action) => action, ...options }
  );
}

function textArea(options) {
  return createTextArea(
    options.disabled === true
      ? options
      : { onAction: (action) => action, ...options }
  );
}

function commandInput(options) {
  return createCommandInput({ meta: { accessibleName: "Command input" },
    onTransition: (action) => action,
    ...options
  });
}

test('richText component renders sanitized styled segments as plain frame text', () => {
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
  const frame = renderElementFrame(text({ content: 'Badge', id: 'badge-text',
    textRole: 'badge',
    styles: {
            root: { underline: true }
        } }), { columns: 12, rows: 1 });
  const first = frame.cells.find((cell) => cell.text === 'B');

  assert.deepEqual(first?.style, {
    fg: { kind: 'theme', token: 'badge.foreground' },
    bg: { kind: 'theme', token: 'badge.background' },
    bold: true,
    underline: true
  });
  assert.deepEqual(first?.source, textSource('badge-text', 'text', 'role.badge', { partName: 'role.badge', partType: 'text' }));
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
  assert.deepEqual(frame.cells.find((cell) => cell.text === 'A')?.style, {
    fg: { kind: 'theme', token: 'status.success' },
    bg: { kind: 'theme', token: 'app.background' }
  });
  assert.deepEqual(beta?.style, {
    fg: { kind: 'theme', token: 'status.warning' },
    bg: { kind: 'theme', token: 'app.background' },
    underline: true,
    bold: true
  });
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
  assert.deepEqual(warn?.style, {
    fg: { kind: 'theme', token: 'status.warning' },
    bg: { kind: 'theme', token: 'app.background' },
    underline: true,
    bold: true
  });
});

test('interactive richText exposes each logical link as the focus pointer and accessibility target', () => {
  const element = richText({
    id: 'interactive-rich-text',
    wrap: true,
    segments: [
      { kind: 'text', text: 'plain ' },
      { kind: 'text', text: 'first link', link: { href: 'https://example.test/first', id: 'first' } },
      { kind: 'text', text: ' and ' },
      { kind: 'text', text: 'second', link: { href: 'https://example.test/second' } },
    ],
    onLinkActivate: (event) => ({ event })
  });
  const regions = renderElementRegions(element, { columns: 8, rows: 5 });
  const targets = regions.flatMap((region) => region.hitTargets);
  assert.equal(targets.some((target) => target.id.includes('plain')), false);
  assert.ok(targets.filter((target) => target.id.startsWith('interactive-rich-text:link:0:')).length > 1);
  assert.ok(targets.some((target) => target.id.startsWith('interactive-rich-text:link:1:')));

  const target = targets.find((current) => current.id.startsWith('interactive-rich-text:link:0:'));
  assert.ok(target);
  const message = target.message(pointerEvent({
    kind: 'click', row: target.bounds.row, column: target.bounds.column, localRow: 0, localColumn: 0
  }));

  assert.deepEqual(message?.event, {
    kind: 'activate',
    link: { href: 'https://example.test/first', id: 'first' },
    trigger: { kind: 'pointer', button: 'left', modifiers: { ctrl: false, alt: false, shift: false } }
  });

  const focused = renderElementFrame(element, { columns: 8, rows: 5 }, {
    focusPath: ['interactive-rich-text', 'link:1']
  });
  assert.equal(focused.accessibility.root.focused, undefined);
  assert.equal(focused.accessibility.root.children?.[0]?.focused, undefined);
  assert.equal(focused.accessibility.root.children?.[1]?.focused, true);
  assert.equal(focused.cells.find((cell) =>
    cell.text === 's' && cell.source?.itemIndex === 3
  )?.style?.bold, true);
  assert.deepEqual(focused.accessibility.focusPath, [
    'interactive-rich-text',
    'interactive-rich-text:link:1'
  ]);
});

test('richText preserves one logical link across styled segments', () => {
  const link = { href: 'https://example.test/docs' };
  const element = richText({
    id: 'styled-logical-link',
    segments: [
      { kind: 'text', text: 'Doc', link, style: { bold: true } },
      { kind: 'text', text: 'umentation', link, style: { italic: true } },
    ],
    wrap: true,
    onLinkActivate: (event) => event,
  });
  const frame = renderElementFrame(element, { columns: 5, rows: 3 });
  const targets = renderElementRegions(element, { columns: 5, rows: 3 })
    .flatMap((region) => region.hitTargets);

  assert.equal(frame.accessibility.root.children?.length, 1);
  assert.equal(frame.accessibility.root.children?.[0]?.label, 'Documentation');
  assert.ok(targets.length > 1);
  assert.ok(targets.every((target) => target.id.startsWith('styled-logical-link:link:0:')));

  const separate = renderElementFrame(richText({
    id: 'separate-links',
    segments: [
      { kind: 'text', text: 'one', link: { href: link.href } },
      { kind: 'text', text: 'two', link: { href: link.href } },
    ],
    onLinkActivate: (event) => event,
  }), { columns: 8, rows: 1 });
  assert.equal(separate.accessibility.root.children?.length, 2);
});

test('unwrapped richText preserves explicit line breaks in measurement and rendering', () => {
  const frame = renderElementFrame(richText({
    id: 'multiline-rich-text',
    segments: [
      { kind: 'text', text: 'first\n' },
      { kind: 'text', text: 'second' },
    ],
  }), { columns: 8, rows: 2 });

  assert.equal(renderFramePlain(frame), 'first\nsecond');
});

test('textArea renders multiline windows and exposes cursor/accessibility state', () => {
  const frame = renderElementFrame(textArea({ meta: { accessibleName: "Text area" },
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

test('editable text controls expose source metadata for frame, value, placeholder, and selection', () => {
  const inputFrame = renderElementFrame(textInput({ meta: { accessibleName: "Text input" },
    id: 'email',
    presentation: { value: 'abc', cursor: 0, selection: { startOffset: 1, endOffsetExclusive: 2 } },
  }), { columns: 12, rows: 1 });
  const placeholderFrame = renderElementFrame(textInput({ meta: { accessibleName: "Text input" },
    id: 'empty',
    presentation: { value: '', cursor: 0 },
    placeholder: 'Email'
  }), { columns: 12, rows: 1 });
  const numberFrame = renderElementFrame(numberInput({ meta: { accessibleName: "Number input" },
    id: 'qty',
    presentation: { value: '42', cursor: 2, validity: 'valid', parsedValue: 42 }
  }), { columns: 12, rows: 1 });

  assert.equal(inputFrame.cells.find((cell) => cell.text === '›')?.source?.description, 'frame.prefix');
  assert.equal(inputFrame.cells.find((cell) => cell.text === 'a')?.source?.description, 'value');
  assert.equal(inputFrame.cells.find((cell) => cell.text === 'b')?.source?.description, 'selection');
  assert.equal(inputFrame.cells.some((cell) => cell.source?.description === 'frame.suffix'), false);
  assert.equal(inputFrame.cells.some((cell) => cell.source?.description === 'value.padding'), true);
  assert.equal(inputFrame.cells.find((cell) => cell.text === 'b')?.source?.elementId, 'email');
  assert.equal(placeholderFrame.cells.find((cell) => cell.text === 'E')?.source?.description, 'placeholder');
  assert.equal(numberFrame.cells.find((cell) => cell.text === '4')?.source?.elementKind, 'terminal-ui/components/number-input');
  assert.equal(numberFrame.cells.find((cell) => cell.text === '4')?.source?.description, 'value');
});

test('text components map Unicode cursor positions through the shared text contract', () => {
  const value = 'a🙂界b';
  const textInputFrame = renderElementFrame(textInput({ meta: { accessibleName: "Text input" },
    id: 'unicode-input',
    presentation: { value, cursor: 'a🙂'.length, selection: { startOffset: 1, endOffsetExclusive: 'a🙂'.length } }
  }), { columns: 12, rows: 1 }, { focusPath: ['unicode-input'] });
  const secondaryInputFrame = renderElementFrame(textInput({ meta: { accessibleName: "Text input" },
    id: 'unicode-field',
    presentation: { value: 'go🙂', cursor: 'go🙂'.length }
  }), { columns: 12, rows: 1 }, { focusPath: ['unicode-field'] });
  const commandFrame = renderElementFrame(commandInput({ meta: { accessibleName: "Command input" },
    id: 'unicode-command',
    prompt: '> ',
    presentation: { input: { text: value, cursor: 'a🙂'.length, selection: { startOffset: 1, endOffsetExclusive: 'a🙂'.length } }, open: false, suggestions: prepareCommandSuggestions([]) }
  }), { columns: 18, rows: 1 }, { focusPath: ['unicode-command'] });

  assert.deepEqual(cursorPosition(textInputFrame.cursor), { row: 1, column: 6 });
  assert.deepEqual(cursorPosition(secondaryInputFrame.cursor), { row: 1, column: 7 });
  assert.deepEqual(cursorPosition(commandFrame.cursor), { row: 1, column: 6 });
  assert.deepEqual(textInputFrame.cursor?.source, formSource('unicode-input', 'textInput', 'cursor'));
  assert.deepEqual(secondaryInputFrame.cursor?.source, formSource('unicode-field', 'textInput', 'cursor'));
  assert.deepEqual(commandFrame.cursor?.source, {
    elementId: 'unicode-command',
    elementKind: 'terminal-ui/components/command-input',
    rendererFamily: 'component',
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
  assert.equal(renderFramePlain(textInputFrame), '› a🙂界b');
  assert.equal(renderFramePlain(secondaryInputFrame), '› go🙂');
  assert.equal(renderFramePlain(commandFrame), '> a🙂界b');
  assert.equal(textInputFrame.cells.some((cell) => cell.style?.bg?.kind === 'theme' && cell.style.bg.token === 'selection.background'), true);
  assert.equal(commandFrame.cells.some((cell) => cell.style?.bg?.kind === 'theme' && cell.style.bg.token === 'selection.background'), true);
});

test('textArea editable cells expose gutter, value, placeholder, and selection source metadata', () => {
  const selectedFrame = renderElementFrame(textArea({ meta: { accessibleName: "Text area" },
    id: 'notes',
    presentation: {
      document: prepareTextDocument('alpha\nbeta'),
      caret: textCaretAt(0),
      selection: textDocumentSelectionBetween(1, 4)
    },
  }), { columns: 12, rows: 2 });
  const placeholderFrame = renderElementFrame(textArea({ meta: { accessibleName: "Text area" },
    id: 'notes-empty',
    presentation: { document: prepareTextDocument(''), caret: textCaretAt(0) },
    placeholder: 'Write notes'
  }), { columns: 12, rows: 1 });

  assert.equal(selectedFrame.cells.find((cell) => cell.text === '›')?.source?.description, 'gutter.prefix');
  assert.equal(selectedFrame.cells.find((cell) => cell.text === 'a')?.source?.description, 'value');
  assert.equal(selectedFrame.cells.find((cell) => cell.text === 'l')?.source?.description, 'selection');
  assert.equal(selectedFrame.cells.find((cell) => cell.row === 2 && cell.text === 'b')?.source?.description, 'value');
  assert.equal(placeholderFrame.cells.find((cell) => cell.text === 'W')?.source?.description, 'placeholder');
  assert.equal(placeholderFrame.accessibility.root.value, '');
});

test('textArea content inherits its containing surface instead of painting glyph backgrounds', () => {
  const createArea = (extra = {}) => textArea({
    meta: { accessibleName: 'Text area' },
    id: 'inherited-editor',
    presentation: { document: prepareTextDocument('alpha'), caret: textCaretAt(0) },
    ...extra
  });
  const bare = renderElementFrame(createArea(), { columns: 16, rows: 3 });
  const embedded = renderElementFrame(surface(createArea(), {
    id: 'editor-surface',
    appearance: 'neutral'
  }), { columns: 16, rows: 3 });
  const opaque = renderElementFrame(createArea({
    styles: { root: { bg: { kind: 'theme', token: 'status.warning' } } }
  }), { columns: 16, rows: 3 });

  assert.equal(bare.cells.find((cell) => cell.text === 'l')?.style?.bg?.token, 'app.background');
  assert.equal(
    embedded.cells.find((cell) => cell.text === 'l')?.style?.bg?.token,
    'surface.background'
  );
  assert.equal(
    embedded.cells.find((cell) => cell.row === 1 && cell.column === 12)?.style?.bg?.token,
    'surface.background'
  );
  assert.equal(
    bare.cells.some((cell) =>
      cell.source?.partName === 'value' && cell.style?.bg?.token === 'control.background'
    ),
    false
  );
  assert.equal(opaque.cells.find((cell) => cell.text === 'l')?.style?.bg?.token, 'status.warning');
  assert.equal(
    opaque.cells.find((cell) => cell.row === 3 && cell.column === 12)?.style?.bg?.token,
    'status.warning'
  );
  assert.equal(
    opaque.cells.find((cell) => cell.row === 3 && cell.column === 12)?.source?.description,
    'root.background'
  );
});

test('textArea paints active lines gutters decorations and validation as coherent planes', () => {
  const frame = renderElementFrame(textArea({
    meta: { accessibleName: 'Text area' },
    id: 'plane-editor',
    presentation: {
      document: prepareTextDocument('alpha\nbeta'),
      caret: textCaretAt(0)
    },
    lineNumbers: true,
    highlightActiveLine: true,
    decorations: [{ kind: 'style', startOffset: 1, endOffsetExclusive: 4, label: 'search.match' }],
    error: 'Required'
  }), { columns: 20, rows: 4 });
  const decoration = frame.cells.find((cell) => cell.text === 'l');
  const activeFill = frame.cells.find((cell) =>
    cell.row === 1 && cell.source?.description === 'activeLine.background'
  );
  const unusedGutter = frame.cells.find((cell) => cell.row === 3 && cell.column === 1);
  const error = frame.cells.find((cell) => cell.row === 4 && cell.text === 'R');

  assert.equal(decoration?.source?.partType, 'decoration');
  assert.equal(decoration?.style?.bg?.token, 'editor.activeLine.background');
  assert.equal(activeFill?.style?.bg?.token, 'editor.activeLine.background');
  assert.equal(unusedGutter?.source?.description, 'gutter.background');
  assert.equal(unusedGutter?.style?.bg?.token, 'editor.gutter.background');
  assert.equal(error?.source?.description, 'validation.error');
  assert.equal(error?.style?.fg?.token, 'status.error');
  assert.equal(error?.style?.bg?.token, 'app.background');
});

test('textArea can opt into line number gutter and active line anatomy', () => {
  const frame = renderElementFrame(textArea({ meta: { accessibleName: "Text area" },
    id: 'editor',
    presentation: { document: prepareTextDocument('alpha\nbeta'), caret: textCaretAt('alpha\nb'.length) },
    lineNumbers: { minWidth: 2 },
    highlightActiveLine: true
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
  const frame = renderElementFrame(textArea({ meta: { accessibleName: "Text area" },
    id: 'wide-gutter-editor',
    presentation: { document: prepareTextDocument(value), caret: textCaretAt(cursor) },
    lineNumbers: true
  }), { columns: 24, rows: 12 }, { focusPath: ['wide-gutter-editor'] });

  assert.equal(renderFramePlain(frame).split('\n')[0], '› 1 │ line 1');
  assert.equal(renderFramePlain(frame).split('\n')[9], '│10 │ line 10');
  assert.deepEqual(cursorPosition(frame.cursor), { row: 10, column: 7 });
  assert.equal(frame.cells.find((cell) => cell.row === 10 && cell.text === 'l')?.column, 7);
});

test('textArea renders caller-controlled decoration ranges without overriding selection', () => {
  const frame = renderElementFrame(textArea({ meta: { accessibleName: "Text area" },
    id: 'searchable',
    presentation: {
      document: prepareTextDocument('alpha beta gamma'),
      caret: textCaretAt(0),
      selection: textDocumentSelectionBetween(0, 5)
    },
    decorations: [
      { kind: 'style', startOffset: 6, endOffsetExclusive: 10, label: 'search.match' },
      { kind: 'style', startOffset: 11, endOffsetExclusive: 16, label: 'custom.match', style: { fg: { kind: 'theme', token: 'status.warning' }, bold: true } }
    ]
  }), { columns: 24, rows: 1 });
  const selected = frame.cells.find((cell) => cell.text === 'a');
  const decorated = frame.cells.find((cell) => cell.text === 'b');
  const custom = frame.cells.find((cell) => cell.text === 'g');

  assert.equal(renderFramePlain(frame), '› alpha beta gamma');
  assert.equal(selected?.source?.partType, 'selection');
  assert.equal(selected?.style?.bg?.token, 'selection.background');
  assert.equal(decorated?.source?.partType, 'decoration');
  assert.equal(decorated?.source?.description, 'search.match');
  assert.equal(decorated?.style?.fg?.token, 'menu.match');
  assert.equal(decorated?.style?.underline, true);
  assert.equal(custom?.source?.description, 'custom.match');
  assert.equal(custom?.style?.fg?.token, 'status.warning');
  assert.equal(custom?.style?.bold, true);
});

test('textArea can soft-wrap long logical lines while preserving editor anatomy', () => {
  const frame = renderElementFrame(textArea({ meta: { accessibleName: "Text area" },
    id: 'wrapped-editor',
    presentation: { document: prepareTextDocument('alpha beta gamma'), caret: textCaretAt('alpha beta'.length) },
    lineNumbers: { minWidth: 2 },
    highlightActiveLine: true,
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

test('textArea row-offset maps come from decorated terminal layout geometry', () => {
  const document = prepareTextDocument('a\tb🙂éwide\nsecond line');
  const narrow = createTextAreaRowOffsetMap({
    document,
    terminalWidth: 12,
    terminalRows: 10,
    lineNumbers: true,
    wrap: true,
    scrollbar: { visible: 'auto' }
  });
  const wide = createTextAreaRowOffsetMap({
    document,
    terminalWidth: 24,
    terminalRows: 10,
    lineNumbers: true,
    wrap: true,
    scrollbar: { visible: 'auto' }
  });

  assert.deepEqual(
    Array.from({ length: narrow.rowCount }, (_value, row) => narrow.sourceOffsetAtRow(row)),
    [0, 5, 12, 19]
  );
  assert.equal(narrow.rowAtSourceOffset(11), 1);
  assert.equal(narrow.rowAtSourceOffset(12), 2);
  assert.deepEqual(
    Array.from({ length: wide.rowCount }, (_value, row) => wide.sourceOffsetAtRow(row)),
    [0, 12]
  );
});

test('textArea decorations preserve source while styling, concealing, and replacing display text', () => {
  const document = prepareTextDocument('**bold** [site](target.md)');
  const frame = renderElementFrame(textArea({
    meta: { accessibleName: 'Hybrid editor' },
    id: 'decorated-editor',
    presentation: { document, caret: textCaretAt(4) },
    decorations: [
      { kind: 'conceal', startOffset: 0, endOffsetExclusive: 2 },
      { kind: 'style', startOffset: 2, endOffsetExclusive: 6, style: { bold: true }, label: 'strong' },
      { kind: 'conceal', startOffset: 6, endOffsetExclusive: 8 },
      {
        kind: 'replace',
        startOffset: 9,
        endOffsetExclusive: 26,
        replacementText: 'site',
        accessibilityText: 'Link: site',
        style: { underline: true },
        label: 'link'
      }
    ]
  }), { columns: 24, rows: 1 }, { focusPath: ['decorated-editor'] });

  assert.equal(renderFramePlain(frame), '› bold site');
  assert.equal(frame.cells.find((cell) => cell.text === 'b')?.style?.bold, true);
  assert.equal(frame.cells.find((cell) => cell.text === 's')?.style?.underline, true);
  assert.equal(frame.accessibility.root.value, 'bold Link: site');
  assert.equal(frame.accessibility.root.textPosition.caretOffset, 2);
  assert.equal(textDocumentText(document), '**bold** [site](target.md)');
});

test('textArea accessibility positions use the sanitized and decorated text coordinate space', () => {
  const controlSource = 'a\r\n\u001B[31mb\u001B[0m';
  const sanitized = renderElementFrame(textArea({
    meta: { accessibleName: 'Sanitized editor' },
    id: 'sanitized-editor',
    presentation: {
      document: prepareTextDocument(controlSource),
      caret: textCaretAt(controlSource.length),
      selection: textDocumentSelectionBetween(1, 3),
    },
    decorations: [{ kind: 'style', startOffset: 4, endOffsetExclusive: 5, style: { bold: true } }],
  }), { columns: 16, rows: 2 }, { focusPath: ['sanitized-editor'] });

  assert.equal(sanitized.accessibility.root.value, 'a\nb');
  assert.deepEqual(sanitized.accessibility.root.textPosition, {
    caretOffset: 3,
    selection: { startOffset: 1, endOffsetExclusive: 2 },
  });

  const replaced = renderElementFrame(textArea({
    meta: { accessibleName: 'Replacement editor' },
    id: 'replacement-editor',
    presentation: {
      document: prepareTextDocument('before [site](target.md) after'),
      caret: textCaretAt(24),
      selection: textDocumentSelectionBetween(7, 24),
    },
    decorations: [{
      kind: 'replace',
      startOffset: 7,
      endOffsetExclusive: 24,
      replacementText: 'site',
      accessibilityText: 'Link: site',
    }],
  }), { columns: 32, rows: 1 }, { focusPath: ['replacement-editor'] });

  assert.equal(replaced.accessibility.root.value, 'before Link: site after');
  assert.deepEqual(replaced.accessibility.root.textPosition, {
    caretOffset: 17,
    selection: { startOffset: 7, endOffsetExclusive: 17 },
  });
});

test('textArea decoration boundaries cannot expose fragments of terminal control sequences', () => {
  const source = 'A\u001B[31mB\u001B[0mC';
  const frame = renderElementFrame(textArea({
    meta: { accessibleName: 'Control editor' },
    id: 'control-editor',
    presentation: { document: prepareTextDocument(source), caret: textCaretAt(source.length) },
    decorations: [{ kind: 'style', startOffset: 2, endOffsetExclusive: 3, style: { bold: true } }],
  }), { columns: 8, rows: 1 });

  assert.equal(renderFramePlain(frame), '› ABC');
  assert.equal(frame.accessibility.root.value, 'ABC');
  assert.equal(frame.accessibility.root.textPosition.caretOffset, 3);
});

test('textArea requires accessibility replacement text to describe a visual replacement', () => {
  assert.throws(() => textArea({
    meta: { accessibleName: 'Invalid editor' },
    id: 'invalid-editor',
    presentation: { document: prepareTextDocument('value'), caret: textCaretAt(0) },
    decorations: [{ kind: 'style', startOffset: 0, endOffsetExclusive: 1, style: { bold: true }, accessibilityText: 'letter' }],
  }), /style decoration 0 cannot replace or relabel content/u);
});

test('textArea replacement decorations compose only with styles that cover the complete visual atom', () => {
  const frame = renderElementFrame(textArea({
    meta: { accessibleName: 'Composed decoration editor' },
    id: 'composed-decoration-editor',
    presentation: { document: prepareTextDocument('abcdef'), caret: textCaretAt(0) },
    decorations: [
      { kind: 'style', startOffset: 0, endOffsetExclusive: 4, style: { bold: true }, label: 'outer' },
      {
        kind: 'replace',
        startOffset: 1,
        endOffsetExclusive: 3,
        replacementText: 'X',
        style: { underline: true },
        label: 'replacement',
      },
    ],
  }), { columns: 8, rows: 1 });
  const replacement = frame.cells.find((cell) => cell.text === 'X');

  assert.equal(replacement?.style?.bold, true);
  assert.equal(replacement?.style?.underline, true);
  assert.throws(() => textArea({
    meta: { accessibleName: 'Partial decoration editor' },
    id: 'partial-decoration-editor',
    presentation: { document: prepareTextDocument('abcdef'), caret: textCaretAt(0) },
    decorations: [
      { kind: 'replace', startOffset: 1, endOffsetExclusive: 4, replacementText: 'X' },
      { kind: 'style', startOffset: 2, endOffsetExclusive: 5, style: { bold: true } },
    ],
  }), /must not partially overlap replacement decorations/u);
});

test('textArea concealments union overlapping syntax ranges without becoming replacements', () => {
  const frame = renderElementFrame(textArea({
    meta: { accessibleName: 'Concealed syntax editor' },
    id: 'concealed-syntax-editor',
    presentation: { document: prepareTextDocument('[label](target)'), caret: textCaretAt(0) },
    decorations: [
      { kind: 'conceal', startOffset: 0, endOffsetExclusive: 1, label: 'outer.start' },
      { kind: 'conceal', startOffset: 6, endOffsetExclusive: 15, label: 'outer.end' },
      { kind: 'conceal', startOffset: 8, endOffsetExclusive: 14, label: 'destination' },
      { kind: 'style', startOffset: 1, endOffsetExclusive: 6, style: { underline: true }, label: 'label' },
    ],
  }), { columns: 16, rows: 1 });

  assert.equal(renderFramePlain(frame), '› label');
  assert.equal(frame.accessibility.root.value, 'label');
  assert.equal(frame.cells.find((cell) => cell.text === 'l')?.style?.underline, true);
  assert.throws(() => textArea({
    meta: { accessibleName: 'Empty replacement editor' },
    id: 'empty-replacement-editor',
    presentation: { document: prepareTextDocument('value'), caret: textCaretAt(0) },
    decorations: [{ kind: 'replace', startOffset: 0, endOffsetExclusive: 1, replacementText: '' }],
  }), /requires non-empty replacementText/u);
  assert.throws(() => textArea({
    meta: { accessibleName: 'Conflicting replacement editor' },
    id: 'conflicting-replacement-editor',
    presentation: { document: prepareTextDocument('value'), caret: textCaretAt(0) },
    decorations: [
      { kind: 'conceal', startOffset: 0, endOffsetExclusive: 2 },
      { kind: 'replace', startOffset: 1, endOffsetExclusive: 3, replacementText: 'X' },
    ],
  }), /conceal and replacement decorations must not overlap/u);
});

test('wrapped textArea exposes scrollbar scope over visual rows', () => {
  const frame = renderElementFrame(textArea({ meta: { accessibleName: "Text area" },
    id: 'wrapped-scroll',
    presentation: { document: prepareTextDocument('alpha beta gamma delta'), caret: textCaretAt(0), scroll: { offsetRow: 1, offsetColumn: 0, contentRows: 0, contentColumns: 0, viewportRows: 0, viewportColumns: 0, followTail: false } },
    wrap: true,
    scrollbar: { visible: 'always', axis: 'vertical' }
  }), { columns: 9, rows: 2 });

  assert.equal(renderFramePlain(frame), '› beta g┃\n│ amma d│');
  assert.equal(frame.cells.find((cell) => cell.text === '┃')?.source?.elementKind, 'terminal-ui/components/text-area');
  assert.equal(
    frame.accessibility.root.description,
    '1 lines. Showing 2-3 of 4 rows. Omitted before: 1. Omitted after: 1. Horizontal offset: 0.'
  );
});

test('editable text controls remain readable in high contrast and no-color rendering modes', () => {
  const element = column([
    textInput({ meta: { accessibleName: "Text input" },
      id: 'contrast-input',
      presentation: { value: 'alpha', cursor: 0, selection: { startOffset: 1, endOffsetExclusive: 4 } },
      error: 'Invalid value'
    }),
    commandInput({ meta: { accessibleName: "Command input" },
      id: 'contrast-command',
      prompt: '/',
      presentation: { input: { text: '', cursor: 0 }, open: false, suggestions: prepareCommandSuggestions([]) },
      placeholder: 'command',
      validation: { level: 'warning', message: 'Waiting' }
    })
  ]);
  const frame = renderElementFrame(element, { columns: 28, rows: 4 }, {
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

  assert.match(highContrast.plainTextFrame, /x alpha/u);
  assert.match(highContrast.plainTextFrame, /^\/command$/mu);
  assert.match(highContrast.ansiFrame, /\\x1b\[/u);
  assert.match(highContrast.frameJson, /"description": "selection"/u);
  assert.match(highContrast.frameJson, /"description": "validation"/u);
  assert.doesNotMatch(noColor.ansiFrame, /\\x1b\[[0-9;]*m/u);
  assert.equal(noColor.plainTextFrame, highContrast.plainTextFrame);
});

test('editable text controls remain identifiable when the theme has no field fill', () => {
  const frame = renderElementFrame(column([
    textInput({
      id: 'no-color-input',
      presentation: { value: 'alpha', cursor: 0 },
      meta: { accessibleName: "Text input", focus: { disabled: true } }
    }),
    commandInput({
      id: 'no-color-command',
      prompt: '› ',
      presentation: { input: { text: '', cursor: 0 }, open: false, suggestions: prepareCommandSuggestions([]) },
      placeholder: '/open',
      meta: { accessibleName: "Command input", focus: { disabled: true } }
    })
  ]), { columns: 20, rows: 2 }, {
    theme: noColorTheme
  });

  assert.match(renderFramePlain(frame), /^\| alpha/mu);
  assert.match(renderFramePlain(frame), /^› \/open/mu);
});

test('disabled textInput exposes no mouse hit target', () => {
  const frame = renderElementFrame(textInput({ meta: { accessibleName: "Text input" },
    id: 'disabled-input',
    presentation: { value: 'locked', cursor: 0 },
    disabled: true
  }), { columns: 16, rows: 1 });

  assert.deepEqual(frame.hitTargets ?? [], []);
});

test('textInput maps pointer positions to text offsets when opted in', () => {
  const regions = renderElementRegions(textInput({ meta: { accessibleName: "Text input" },
    id: 'editable-input',
    presentation: { value: 'alpha', cursor: 0 },
    onAction: (action) => ({ action })
  }), { columns: 16, rows: 1 });
  const target = targetById(regions, 'editable-input:text');
  const message = target.message(pointerEvent({
    kind: 'pointerDown',
    row: 1,
    column: 5,
    localRow: 1,
    localColumn: 5
  }));

  assert.deepEqual(message?.action, {
    kind: 'pointer',
    action: { kind: 'placeCaret', offset: 2 }
  });
});

test('editable text targets share word selection and non-mutating context menus', () => {
  const regions = renderElementRegions(createTextInput({ meta: { accessibleName: 'Text input' },
    id: 'shared-text-pointer',
    presentation: {
      value: 'alpha bravo',
      cursor: 3,
      selection: { startOffset: 0, endOffsetExclusive: 5 },
    },
    onAction: (action) => ({ action }),
    onContextMenu: (event) => ({ context: event }),
  }), { columns: 20, rows: 1 });
  const target = targetById(regions, 'shared-text-pointer:text');
  const doubleClick = target.message({
    ...pointerEvent({ kind: 'click', row: 1, column: 11, localRow: 1, localColumn: 11 }),
    clickCount: 2,
  });
  const contextMenu = target.message({
    ...pointerEvent({ kind: 'contextMenu', row: 1, column: 11, localRow: 1, localColumn: 11 }),
    button: 'right',
  });

  assert.deepEqual(doubleClick?.action, {
    kind: 'pointer',
    action: { kind: 'endSelection', anchor: 6, offset: 11 },
  });
  assert.deepEqual(contextMenu?.context, {
    kind: 'contextMenu',
    offset: 8,
    selection: { startOffset: 0, endOffsetExclusive: 5 },
    row: 1,
    column: 11,
    modifiers: { shift: false, alt: false, ctrl: false },
  });
});

test('numberInput exposes the shared text pointer editing contract', () => {
  const regions = renderElementRegions(createNumberInput({ meta: { accessibleName: 'Number input' },
    id: 'number-pointer',
    presentation: { value: '12345', cursor: 0, validity: 'valid', parsedValue: 12345 },
    onAction: (action) => ({ action }),
  }), { columns: 16, rows: 1 });
  const target = targetById(regions, 'number-pointer:input');
  const placed = target.message(pointerEvent({
    kind: 'pointerDown',
    row: 1,
    column: 6,
    localRow: 1,
    localColumn: 6,
  }));

  assert.deepEqual(placed?.action, {
    kind: 'pointer',
    action: { kind: 'placeCaret', offset: 3 },
  });
});

test('single-line text controls share cursor-relative rendering and pointer geometry', () => {
  const textElement = createTextInput({ meta: { accessibleName: 'Text input' },
    id: 'windowed-text-input',
    presentation: { value: 'abcdef', cursor: 6 },
    onAction: (action) => ({ action }),
  });
  const textFrame = renderElementFrame(textElement, { columns: 6, rows: 1 }, {
    focusPath: ['windowed-text-input'],
  });
  const textTarget = targetById(
    renderElementRegions(textElement, { columns: 6, rows: 1 }),
    'windowed-text-input:text',
  );
  const textMessage = textTarget.message(pointerEvent({
    kind: 'pointerDown',
    row: 1,
    column: 4,
    localRow: 1,
    localColumn: 4,
  }));

  assert.match(renderFramePlain(textFrame), /‹def/u);
  assert.deepEqual(textMessage?.action, {
    kind: 'pointer',
    action: { kind: 'placeCaret', offset: 3 },
  });

  const numberElement = createNumberInput({ meta: { accessibleName: 'Number input' },
    id: 'windowed-number-input',
    presentation: { value: '12345', cursor: 5, validity: 'valid', parsedValue: 12345 },
    onAction: (action) => ({ action }),
  });
  const numberFrame = renderElementFrame(numberElement, { columns: 12, rows: 1 }, {
    focusPath: ['windowed-number-input'],
  });
  const numberTarget = targetById(
    renderElementRegions(numberElement, { columns: 12, rows: 1 }),
    'windowed-number-input:input',
  );
  const numberMessage = numberTarget.message(pointerEvent({
    kind: 'pointerDown',
    row: 1,
    column: 4,
    localRow: 1,
    localColumn: 4,
  }));

  assert.match(renderFramePlain(numberFrame), /‹5/u);
  assert.deepEqual(numberMessage?.action, {
    kind: 'pointer',
    action: { kind: 'placeCaret', offset: 4 },
  });
});

test('disabled textInput exposes no editable pointer targets', () => {
  const frame = renderElementFrame(textInput({ meta: { accessibleName: "Text input" },
    id: 'disabled-editable-input',
    presentation: { value: 'locked', cursor: 0 },
    disabled: true
  }), { columns: 16, rows: 1 });

  assert.deepEqual(frame.hitTargets ?? [], []);
});

test('textArea maps pointer positions through gutters visual rows and selection drag actions', () => {
  const regions = renderElementRegions(textArea({ meta: { accessibleName: "Text area" },
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

test('scrollable textArea couples captured drag selection with one controlled scroll step', () => {
  const regions = renderElementRegions(textArea({ meta: { accessibleName: 'Text area' },
    id: 'drag-scroll-area',
    presentation: {
      document: prepareTextDocument('one\ntwo\nthree\nfour'),
      caret: textCaretAt(0),
      scroll: { offsetRow: 0, offsetColumn: 0, followTail: false },
    },
    onAction: (action) => ({ action }),
  }), { columns: 16, rows: 2 });
  const target = targetById(regions, 'drag-scroll-area:text');
  const message = target.message(pointerEvent({
    kind: 'drag',
    row: 3,
    column: 4,
    localRow: 3,
    localColumn: 4,
    pressRow: 1,
    pressColumn: 2,
    pressLocalRow: 1,
    pressLocalColumn: 2,
  }));

  assert.equal(message?.action.kind, 'pointer');
  assert.deepEqual(message?.action.scroll, {
    nextState: { offsetRow: 1, offsetColumn: 0, followTail: false },
    source: 'drag',
    target: 'content',
  });
});

test('textArea horizontal windows use visual cells without splitting graphemes', () => {
  const frame = renderElementFrame(textArea({ meta: { accessibleName: "Text area" },
    id: 'unicode-area',
    presentation: { document: prepareTextDocument('a🙂界b\nplain'), caret: textCaretAt('a🙂界'.length), scroll: { offsetRow: 0, offsetColumn: 3, contentRows: 0, contentColumns: 0, viewportRows: 0, viewportColumns: 0, followTail: false } },
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
    elementKind: `terminal-ui/components/${elementKind === 'richText' ? 'rich-text' : elementKind}`,
    rendererFamily: 'component',
    cellRole: 'text',
    description: label,
    ...extra
  };
}

function formSource(elementId, elementKind, label) {
  return {
    elementId,
    elementKind: `terminal-ui/components/${elementKind === 'textInput' ? 'text-input' : elementKind === 'textArea' ? 'text-area' : elementKind}`,
    rendererFamily: 'component',
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
      supportsRawInput: true
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

test('helpBar and activityIndicator provide reusable application status displays', () => {
  const helpFrame = renderElementFrame(helpBar({
    id: 'help',
    groups: [{
      id: 'primary',
      bindings: [
        { binding: { kind: 'key', key: 'enter' }, label: 'open' },
        { binding: { kind: 'key', key: 'escape' }, label: 'close' }
      ]
    }]
  }), { columns: 32, rows: 1 });
  const activityFrame = renderElementFrame(activityIndicator({
    id: 'activity',
    label: 'Indexing',
    status: 'running'
  }), { columns: 32, rows: 1 });

  assert.equal(renderFramePlain(helpFrame), 'Enter open  Escape close');
  assert.equal(helpFrame.accessibility.root.role, 'group');
  assert.equal(renderFramePlain(activityFrame), '⠋ Indexing');
  assert.equal(activityFrame.accessibility.root.value, 'Indexing (running)');
});

test('helpBar keeps compact bindings whole instead of clipping partial labels', () => {
  const frame = renderElementFrame(helpBar({
    id: 'help-compact',
    groups: [{
      id: 'primary',
      bindings: [
        { binding: { kind: 'key', key: 'enter' }, label: 'select/open file' },
        { binding: { kind: 'key', key: 'space' }, label: 'toggle folder' },
        { binding: { kind: 'key', key: 'escape' }, label: 'open/toggle' }
      ]
    }]
  }), { columns: 26, rows: 1 });

  assert.equal(renderFramePlain(frame), 'Enter select/open file  …');
  assert.doesNotMatch(renderFramePlain(frame), /toggle/u);
});

test('activityIndicator renders caller-driven frames and terminal status', () => {
  const runningFrame = renderElementFrame(activityIndicator({
    id: 'activity-running',
    label: 'Loading',
    status: 'running',
    frames: ['a', 'b'],
    frameIndex: 3
  }), { columns: 32, rows: 1 });
  const successFrame = renderElementFrame(activityIndicator({
    id: 'activity-success',
    label: 'Loaded',
    status: 'success'
  }), { columns: 32, rows: 1 });

  assert.equal(renderFramePlain(runningFrame), 'b Loading');
  assert.equal(runningFrame.accessibility.root.value, 'Loading (running)');
  assert.equal(renderFramePlain(successFrame), '✓ Loaded (success)');
  assert.equal(successFrame.accessibility.root.value, 'Loaded (success)');
});
