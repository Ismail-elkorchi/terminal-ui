import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveTerminalCapabilities } from '../../dist/host/index.js';
import { createVisualSnapshot, renderElementRegions } from '../../dist/testing/index.js';
import { highContrastTheme } from '../../dist/theme/index.js';
import {
  createScrollState,
  extractScrollbackSelectionText,
  visibleScrollbackItems
} from '../../dist/behavior/index.js';
import {
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import { scrollback } from '../../dist/components/index.js';

function item(index, text = `Row ${index}`) {
  return { id: `row-${index}`, text };
}

test('scrollback follows the tail by default and marks omitted earlier rows', () => {
  const items = Array.from({ length: 20 }, (_value, index) => item(index));
  const frame = renderElementFrame(scrollback({ id: 'log', items }), { columns: 36, rows: 4 });
  const output = renderFramePlain(frame);

  assert.match(output, /\.\.\. 16 earlier rows omitted \.\.\./u);
  assert.match(output, /Row 17/u);
  assert.match(output, /Row 18/u);
  assert.match(output, /Row 19/u);
  assert.doesNotMatch(output, /Row 0/u);
  assert.equal(frame.accessibility.root.description, 'Showing 17-20 of 20 scrollback rows. Omitted before: 16. Omitted after: 0. Follow tail: true.');
  assert.equal(frame.accessibility.root.children?.length, 4);
  assert.equal(frame.cells.find((cell) => cell.text === '.')?.source?.label, 'omission.before');
  assert.equal(frame.cells.find((cell) => cell.text === '.')?.source?.role, 'decoration');
});

test('scrollback accepts explicit scroll state and marks omitted later rows', () => {
  const items = Array.from({ length: 10 }, (_value, index) => item(index));
  const frame = renderElementFrame(scrollback({
    id: 'log',
    items,
    scroll: createScrollState({ offsetRow: 0, contentRows: 10, viewportRows: 3 })
  }), { columns: 48, rows: 3 });
  const output = renderFramePlain(frame);

  assert.match(output, /Row 0/u);
  assert.match(output, /Row 1/u);
  assert.match(output, /\.\.\. 7 later rows omitted \(paused\) \.\.\./u);
  assert.doesNotMatch(output, /Row 9/u);
  assert.equal(frame.accessibility.root.description, 'Showing 1-3 of 10 scrollback rows. Omitted before: 0. Omitted after: 7. Follow tail: false.');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'omission.after')?.source?.role, 'decoration');
});

test('scrollback sanitizes terminal control sequences before rendering and accessibility', () => {
  const frame = renderElementFrame(scrollback({
    id: 'safe-log',
    items: [item(0, 'safe \u001B[31mred\u001B[0m text')]
  }), { columns: 40, rows: 2 });
  const output = renderFramePlain(frame);

  assert.equal(output, 'safe red text');
  assert.equal(frame.accessibility.root.children?.[0]?.value, 'safe red text');
});

test('scrollback renders timestamp metadata and item style through visible rows', () => {
  const widget = scrollback({
    id: 'metadata-log',
    items: [{
      id: 'meta-1',
      timestamp: '10:30',
      metadata: { status: 'ok', source: 'worker' },
      text: 'Zulu',
      style: { fg: { kind: 'theme', token: 'status.success' }, bold: true }
    }]
  });
  const frame = renderElementFrame(widget, { columns: 80, rows: 2 });
  const styledCell = frame.cells.find((cell) => cell.text === 'Z');
  const timestampCell = frame.cells.find((cell) => cell.text === '[');
  const metadataCell = frame.cells.find((cell) => cell.text === 's');

  assert.equal(renderFramePlain(frame), '[10:30] source=worker status=ok Zulu');
  assert.deepEqual(frame.accessibility.root.children?.map((node) => node.value), ['[10:30] source=worker status=ok Zulu']);
  assert.equal(timestampCell?.source?.label, 'timestamp.open');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'timestamp.value')?.style?.fg?.token, 'log.timestamp');
  assert.equal(metadataCell?.source?.label, 'metadata.source.key');
  assert.equal(metadataCell?.style?.fg?.token, 'log.metadata');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'metadata.status.value')?.text, 'o');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'metadata.status.value')?.source?.itemId, 'meta-1');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'metadata.status.value')?.source?.itemIndex, 0);
  assert.deepEqual(styledCell?.style, { fg: { kind: 'theme', token: 'status.success' }, bold: true });
  assert.equal(styledCell?.source?.label, 'body');
  assert.equal(styledCell?.source?.itemId, 'meta-1');
  assert.equal(frame.accessibility.root.children?.[0]?.value, '[10:30] source=worker status=ok Zulu');
});

test('scrollback renders log levels through log theme tokens and lets item styles refine them', () => {
  const frame = renderElementFrame(scrollback({
    id: 'level-log',
    items: [
      { id: 'info', level: 'info', text: 'Server ready' },
      { id: 'warn', level: 'warning', text: 'Memory high' },
      { id: 'error', level: 'error', text: 'Request failed', style: { bold: true } }
    ],
    scroll: createScrollState({ offsetRow: 0, contentRows: 3, viewportRows: 3 })
  }), { columns: 40, rows: 3 });

  assert.equal(frame.cells.find((cell) => cell.text === 'S')?.style?.fg?.token, 'log.info');
  assert.equal(frame.cells.find((cell) => cell.text === 'M')?.style?.fg?.token, 'log.warning');
  const error = frame.cells.find((cell) => cell.text === 'R');
  assert.equal(error?.style?.fg?.token, 'log.error');
  assert.equal(error?.style?.bold, true);
});

test('scrollback renders folded helper output as visible document metadata', () => {
  const visibleItems = visibleScrollbackItems([
    { id: 'a', text: 'alpha\nmore alpha', metadata: { source: 'worker' } },
    { id: 'b', text: 'bravo' }
  ], { foldedIds: ['a'] });
  const frame = renderElementFrame(scrollback({
    id: 'folded-log',
    items: visibleItems
  }), { columns: 48, rows: 2 });

  assert.match(renderFramePlain(frame), /folded=true source=worker alpha \.\.\./u);
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'metadata.folded.key')?.text, 'f');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'metadata.folded.value')?.text, 't');
  assert.equal(visibleItems[0]?.text, 'alpha ...');
});

test('scrollback wraps visible rows when requested', () => {
  const frame = renderElementFrame(scrollback({
    id: 'wrapped-log',
    items: [item(0, 'abcdef')],
    wrap: true
  }), { columns: 3, rows: 3 });

  assert.equal(renderFramePlain(frame), 'abc\ndef');
  assert.equal(frame.accessibility.root.description, 'Showing 1-2 of 2 scrollback rows. Omitted before: 0. Omitted after: 0. Follow tail: true.');
  assert.deepEqual(frame.accessibility.root.children?.map((node) => node.value), ['abc', 'def']);
});

test('scrollback search navigates to the first match and exposes match segments', () => {
  const items = Array.from({ length: 12 }, (_value, index) => item(index, index === 8 ? 'needle row' : `plain ${index}`));
  const widget = scrollback({ id: 'search-log', items, searchQuery: 'needle' });
  const frame = renderElementFrame(widget, { columns: 40, rows: 5 });

  const matchedCells = frame.cells.filter((cell) => cell.source?.label === 'body.match');
  assert.equal(matchedCells.map((cell) => cell.text).join(''), 'needle');
  assert.equal(matchedCells.every((cell) => cell.style?.fg?.token === 'menu.match'), true);
  assert.equal(frame.cells.some((cell) => cell.source?.label === 'body' && cell.text === ' '), true);
  assert.match(renderFramePlain(frame), /needle row/u);
  assert.ok(frame.accessibility.root.children?.some((node) => node.description === 'Search match.'));
  assert.equal(
    frame.accessibility.root.description,
    'Showing 7-11 of 12 scrollback rows. Omitted before: 6. Omitted after: 1. Follow tail: false. Search query: needle. Matches in rows: 1.'
  );
});

test('scrollback renders empty and selected text states in high contrast and no color output', () => {
  const emptyFrame = renderElementFrame(scrollback({
    id: 'empty-log',
    items: []
  }), { columns: 32, rows: 3 }, { theme: highContrastTheme });
  const selectedFrame = renderElementFrame(scrollback({
    id: 'selected-log',
    items: [
      { id: 'alpha', text: 'alpha' },
      { id: 'bravo', text: 'bravo charlie' }
    ],
    selectedRange: { start: 3, end: 11 }
  }), { columns: 32, rows: 4 }, { theme: highContrastTheme });
  const highContrast = createVisualSnapshot({
    frame: selectedFrame,
    ansi: { capabilities: colorCapabilities(), theme: highContrastTheme }
  });
  const noColor = createVisualSnapshot({
    frame: selectedFrame,
    ansi: { capabilities: noColorCapabilities(), theme: highContrastTheme }
  });

  assert.equal(renderFramePlain(emptyFrame), 'No scrollback rows');
  assert.equal(emptyFrame.cells.find((cell) => cell.text === 'N')?.source?.label, 'empty');
  assert.equal(renderFramePlain(selectedFrame), 'alp[ha]\n[bravo] charlie');
  assert.equal(selectedFrame.cells.find((cell) => cell.source?.label === 'selection.open')?.source?.role, 'decoration');
  assert.equal(selectedFrame.cells.find((cell) => cell.source?.label === 'body.selection')?.style?.bg?.token, 'selection.background');
  assert.equal(highContrast.plainTextFrame, noColor.plainTextFrame);
  assert.doesNotMatch(noColor.ansiFrame, /\\x1b\[[0-9;]*m/u);
});

test('scrollback selection extraction is pure and sanitized', () => {
  const items = [
    item(0, 'alpha'),
    item(1, 'bravo \u001B[31mcharlie\u001B[0m')
  ];
  const text = extractScrollbackSelectionText({
    items,
    selectedRange: { start: 3, end: 18 }
  });

  assert.equal(text, 'ha\nbravo charli');
});

test('scrollback maps pointer selection through metadata to canonical body offsets', () => {
  const regions = renderElementRegions(scrollback({
    id: 'selectable-log',
    items: [
      { id: 'alpha', timestamp: '10:30', metadata: { source: 'worker' }, text: 'alpha' },
      { id: 'bravo', text: 'bravo' }
    ],
    scroll: createScrollState({ offsetRow: 0, contentRows: 2, viewportRows: 2 }),
    onAction: (action) => ({ action })
  }), { columns: 48, rows: 2 });
  const target = targetById(regions, 'selectable-log:text');
  const frame = renderElementFrame(scrollback({
    id: 'selectable-log',
    items: [
      { id: 'alpha', timestamp: '10:30', metadata: { source: 'worker' }, text: 'alpha' },
      { id: 'bravo', text: 'bravo' }
    ],
    scroll: createScrollState({ offsetRow: 0, contentRows: 2, viewportRows: 2 }),
    onAction: (action) => ({ action })
  }), { columns: 48, rows: 2 });
  const alpha = frame.cells.find((cell) => cell.source?.part === 'body' && cell.text === 'p');
  const bravo = frame.cells.find((cell) => cell.source?.itemId === 'bravo' && cell.text === 'a');
  assert.ok(alpha);
  assert.ok(bravo);
  const press = pointerAt(target, 'pointerDown', alpha.row, alpha.column);
  const drag = pointerAt(target, 'drag', bravo.row, bravo.column, alpha);

  assert.deepEqual(target.focus, { kind: 'focus', path: ['selectable-log'] });
  assert.deepEqual(target.message(press)?.action, {
    kind: 'pointer',
    action: { kind: 'placeCaret', offset: 2 }
  });
  assert.deepEqual(target.message(drag)?.action, {
    kind: 'pointer',
    action: { kind: 'extendSelection', anchor: 2, offset: 8 }
  });
});

test('wrapped scrollback preserves selected body source and visual style', () => {
  const frame = renderElementFrame(scrollback({
    id: 'wrapped-selection',
    items: [{ id: 'alpha', text: 'alpha bravo' }],
    wrap: true,
    selectedRange: { start: 2, end: 8 }
  }), { columns: 5, rows: 4 });
  const selected = frame.cells.filter((cell) => cell.source?.part === 'body.selection');

  assert.equal(selected.map((cell) => cell.text).join(''), 'pha br');
  assert.equal(selected.every((cell) => cell.style?.bg?.token === 'selection.background'), true);
  assert.ok(new Set(selected.map((cell) => cell.row)).size > 1);
});

function targetById(regions, id) {
  const target = regions.flatMap((region) => region.hitTargets).find((current) => current.id === id);
  assert.ok(target, `expected hit target ${id}`);
  return target;
}

function pointerAt(target, kind, row, column, press) {
  const localRow = row - target.bounds.row + 1;
  const localColumn = column - target.bounds.column + 1;
  return {
    kind,
    source: 'mouse',
    row,
    column,
    localRow,
    localColumn,
    ...(press === undefined ? {} : {
      pressRow: press.row,
      pressColumn: press.column,
      pressLocalRow: press.row - target.bounds.row + 1,
      pressLocalColumn: press.column - target.bounds.column + 1
    }),
    button: 'left',
    modifiers: { shift: false, alt: false, ctrl: false },
    deltaRows: 0,
    deltaColumns: 0,
    targetId: target.id,
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
