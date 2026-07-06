import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTerminalCapabilities } from '../../dist/host/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import { highContrastTheme } from '../../dist/theme/index.js';
import {
  createScrollState,
  extractScrollbackSelectionText,
  layoutWidget,
  renderFramePlain,
  renderWidgetFrame,
  scrollbackWindow
} from '../../dist/tui/index.js';
import { scrollback, visibleScrollbackItems } from '../../dist/widgets/index.js';

function item(index, text = `Row ${index}`) {
  return { id: `row-${index}`, text };
}

test('scrollback follows the tail by default and marks omitted earlier rows', () => {
  const items = Array.from({ length: 20 }, (_value, index) => item(index));
  const frame = renderWidgetFrame(scrollback({ id: 'log', items }), { columns: 36, rows: 4 });
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
  const frame = renderWidgetFrame(scrollback({
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
  const frame = renderWidgetFrame(scrollback({
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
  const layout = layoutWidget(widget, { columns: 80, rows: 2 });
  const window = scrollbackWindow(widget, layout);
  const frame = renderWidgetFrame(widget, { columns: 80, rows: 2 });
  const styledCell = frame.cells.find((cell) => cell.text === 'Z');
  const timestampCell = frame.cells.find((cell) => cell.text === '[');
  const metadataCell = frame.cells.find((cell) => cell.text === 's');

  assert.equal(window.rows[0]?.text, '[10:30] source=worker status=ok Zulu');
  assert.equal(window.rows[0]?.timestamp, '[10:30]');
  assert.deepEqual(window.rows[0]?.metadata, { source: 'worker', status: 'ok' });
  assert.equal(renderFramePlain(frame), '[10:30] source=worker status=ok Zulu');
  assert.equal(timestampCell?.source?.label, 'timestamp.open');
  assert.equal(metadataCell?.source?.label, 'metadata.source.key');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'metadata.status.value')?.text, 'o');
  assert.deepEqual(styledCell?.style, { fg: { kind: 'theme', token: 'status.success' }, bold: true });
  assert.equal(styledCell?.source?.label, 'body');
  assert.equal(frame.accessibility.root.children?.[0]?.value, '[10:30] source=worker status=ok Zulu');
});

test('scrollback renders log levels through log theme tokens and lets item styles refine them', () => {
  const frame = renderWidgetFrame(scrollback({
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
  const frame = renderWidgetFrame(scrollback({
    id: 'folded-log',
    items: visibleItems
  }), { columns: 48, rows: 2 });

  assert.match(renderFramePlain(frame), /folded=true source=worker alpha \.\.\./u);
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'metadata.folded.key')?.text, 'f');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'metadata.folded.value')?.text, 't');
  assert.equal(visibleItems[0]?.text, 'alpha ...');
});

test('scrollback wraps visible rows when requested', () => {
  const frame = renderWidgetFrame(scrollback({
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
  const layout = layoutWidget(widget, { columns: 40, rows: 5 });
  const window = scrollbackWindow(widget, layout);
  const frame = renderWidgetFrame(widget, { columns: 40, rows: 5 });

  assert.equal(window.matchCount, 1);
  const matchedRow = window.rows.find((row) => row.text === 'needle row');
  assert.equal(matchedRow?.matched, true);
  assert.equal(matchedRow?.segments[0]?.text, 'needle');
  assert.equal(matchedRow?.segments[0]?.matched, true);
  assert.equal(matchedRow?.segments[0]?.style?.fg?.token, 'menu.match');
  assert.equal(matchedRow?.segments[0]?.source?.label, 'body.match');
  assert.equal(matchedRow?.segments[1]?.text, ' row');
  assert.equal(matchedRow?.segments[1]?.style?.fg?.token, 'text.default');
  assert.equal(matchedRow?.segments[1]?.source?.label, 'body');
  assert.match(renderFramePlain(frame), /needle row/u);
  assert.ok(frame.accessibility.root.children?.some((node) => node.description === 'Search match.'));
  assert.equal(
    frame.accessibility.root.description,
    'Showing 7-11 of 12 scrollback rows. Omitted before: 6. Omitted after: 1. Follow tail: false. Search query: needle. Matches in rows: 1.'
  );
});

test('scrollback renders empty and selected text states in high contrast and no color output', () => {
  const emptyFrame = renderWidgetFrame(scrollback({
    id: 'empty-log',
    items: []
  }), { columns: 32, rows: 3 }, { theme: highContrastTheme });
  const selectedFrame = renderWidgetFrame(scrollback({
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
