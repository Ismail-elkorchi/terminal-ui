import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveTerminalCapabilities } from '../../dist/host/index.js';
import {
  createVisualSnapshot
} from '../../dist/testing/index.js';
import { renderElementRegions } from '../../dist/renderer/internal/render.js';
import { logViewerSearchStatistics } from '../../dist/renderer/internal/log-viewer/prepared-data.js';
import { highContrastTheme } from '../../dist/theme/index.js';
import {
  appendLogHistory,
  createScrollState,
  extractLogViewerSelectionText,
  prepareLogHistory,
  logHistoryEntryAt,
  logViewerSearchMatches
} from '../../dist/behavior/index.js';
import {
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import { logViewer } from '../../dist/components/index.js';

function entry(index, text = `Row ${index}`) {
  return { id: `row-${index}`, text };
}

test('log viewer follows the tail by default and marks omitted earlier rows', () => {
  const entries = Array.from({ length: 20 }, (_value, index) => entry(index));
  const frame = renderElementFrame(logViewer({ id: 'log', history: prepareLogHistory(entries) }), { columns: 36, rows: 4 });
  const output = renderFramePlain(frame);

  assert.match(output, /\.\.\. 16 earlier rows omitted \.\.\./u);
  assert.match(output, /Row 17/u);
  assert.match(output, /Row 18/u);
  assert.match(output, /Row 19/u);
  assert.doesNotMatch(output, /Row 0/u);
  assert.equal(frame.accessibility.root.description, 'Showing 17-20 of 20 log rows. Omitted before: 16. Omitted after: 0. Follow tail: true.');
  assert.equal(frame.accessibility.root.children?.length, 4);
  assert.equal(frame.cells.find((cell) => cell.text === '.')?.source?.description, 'omission.before');
  assert.equal(frame.cells.find((cell) => cell.text === '.')?.source?.cellRole, 'decoration');
});

test('log viewer accepts explicit scroll state and marks omitted later rows', () => {
  const entries = Array.from({ length: 10 }, (_value, index) => entry(index));
  const frame = renderElementFrame(logViewer({
    id: 'log',
    history: prepareLogHistory(entries),
    scroll: createScrollState({ offsetRow: 0, contentRows: 10, viewportRows: 3 })
  }), { columns: 48, rows: 3 });
  const output = renderFramePlain(frame);

  assert.match(output, /Row 0/u);
  assert.match(output, /Row 1/u);
  assert.match(output, /\.\.\. 7 later rows omitted \(paused\) \.\.\./u);
  assert.doesNotMatch(output, /Row 9/u);
  assert.equal(frame.accessibility.root.description, 'Showing 1-3 of 10 log rows. Omitted before: 0. Omitted after: 7. Follow tail: false.');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'omission.after')?.source?.cellRole, 'decoration');
});

test('log viewer sanitizes terminal control sequences before rendering and accessibility', () => {
  const frame = renderElementFrame(logViewer({
    id: 'safe-log',
    history: prepareLogHistory([entry(0, 'safe \u001B[31mred\u001B[0m text')])
  }), { columns: 40, rows: 2 });
  const output = renderFramePlain(frame);

  assert.equal(output, 'safe red text');
  assert.equal(frame.accessibility.root.children?.[0]?.value, 'safe red text');
});

test('log viewer renders timestamp, metadata, and entry styles through visible rows', () => {
  const element = logViewer({
    id: 'metadata-log',
    history: prepareLogHistory([{
      id: 'meta-1',
      timestamp: '10:30',
      metadata: { status: 'ok', source: 'worker' },
      text: 'Zulu',
      style: { fg: { kind: 'theme', token: 'status.success' }, bold: true }
    }])
  });
  const frame = renderElementFrame(element, { columns: 80, rows: 2 });
  const styledCell = frame.cells.find((cell) => cell.text === 'Z');
  const timestampCell = frame.cells.find((cell) => cell.text === '[');
  const metadataCell = frame.cells.find((cell) => cell.text === 's');

  assert.equal(renderFramePlain(frame), '[10:30] source=worker status=ok Zulu');
  assert.deepEqual(frame.accessibility.root.children?.map((node) => node.value), ['[10:30] source=worker status=ok Zulu']);
  assert.equal(timestampCell?.source?.description, 'timestamp.open');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'timestamp.value')?.style?.fg?.token, 'log.timestamp');
  assert.equal(metadataCell?.source?.description, 'metadata.source.key');
  assert.equal(metadataCell?.style?.fg?.token, 'log.metadata');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'metadata.status.value')?.text, 'o');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'metadata.status.value')?.source?.itemId, 'meta-1');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'metadata.status.value')?.source?.itemIndex, 0);
  assert.deepEqual(styledCell?.style, { fg: { kind: 'theme', token: 'status.success' }, bold: true });
  assert.equal(styledCell?.source?.description, 'body');
  assert.equal(styledCell?.source?.itemId, 'meta-1');
  assert.equal(frame.accessibility.root.children?.[0]?.value, '[10:30] source=worker status=ok Zulu');
});

test('log viewer rendering uses the prepared metadata order used for row layout', () => {
  const history = prepareLogHistory([{
    id: 'ordered',
    metadata: { a: 'long-value', Z: 'short' },
    text: 'body'
  }]);
  const record = logHistoryEntryAt(history, 0);
  const frame = renderElementFrame(logViewer({
    id: 'ordered-metadata',
    history,
    wrap: true
  }), { columns: 10, rows: 5 });

  assert.equal(record?.displayText, 'Z=short a=long-value body');
  assert.equal(frame.accessibility.root.children?.map((node) => node.value).join(''), record?.displayText);
});

test('log viewer renders log levels through log theme tokens and lets entry styles refine them', () => {
  const frame = renderElementFrame(logViewer({
    id: 'level-log',
    history: prepareLogHistory([
      { id: 'info', level: 'info', text: 'Server ready' },
      { id: 'warn', level: 'warning', text: 'Memory high' },
      { id: 'error', level: 'error', text: 'Request failed', style: { bold: true } }
    ]),
    scroll: createScrollState({ offsetRow: 0, contentRows: 3, viewportRows: 3 })
  }), { columns: 40, rows: 3 });

  assert.equal(frame.cells.find((cell) => cell.text === 'S')?.style?.fg?.token, 'log.info');
  assert.equal(frame.cells.find((cell) => cell.text === 'M')?.style?.fg?.token, 'log.warning');
  const error = frame.cells.find((cell) => cell.text === 'R');
  assert.equal(error?.style?.fg?.token, 'log.error');
  assert.equal(error?.style?.bold, true);
});

test('log viewer renders folded history as visible document metadata', () => {
  const history = prepareLogHistory([
    { id: 'a', text: 'alpha\nmore alpha', metadata: { source: 'worker' } },
    { id: 'b', text: 'bravo' }
  ]);
  const frame = renderElementFrame(logViewer({
    id: 'folded-log',
    history,
    foldedIds: ['a']
  }), { columns: 48, rows: 2 });

  assert.match(renderFramePlain(frame), /source=worker folded=true alpha \.\.\./u);
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'metadata.folded.key')?.text, 'f');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'metadata.folded.value')?.text, 't');
  assert.equal(logHistoryEntryAt(history, 0)?.bodyText, 'alpha\nmore alpha');
});

test('log viewer folding preserves source-local selection anchors', () => {
  const history = prepareLogHistory([
    { id: 'a', text: 'alpha\nmore alpha' },
    { id: 'b', text: 'bravo' }
  ]);
  const selection = {
    anchor: { entryId: 'a', offset: 2 },
    focus: { entryId: 'b', offset: 3 }
  };
  const frame = renderElementFrame(logViewer({
    id: 'folded-selection',
    history,
    foldedIds: ['a'],
    selection
  }), { columns: 48, rows: 3 });

  assert.equal(extractLogViewerSelectionText({ history, selection }), 'pha\nmore alpha\nbra');
  assert.equal(frame.accessibility.root.description?.endsWith('Selection length: 18.'), true);
  assert.equal(logHistoryEntryAt(history, 0)?.bodyText, 'alpha\nmore alpha');
});

test('log viewer wraps visible rows when requested', () => {
  const frame = renderElementFrame(logViewer({
    id: 'wrapped-log',
    history: prepareLogHistory([entry(0, 'abcdef')]),
    wrap: true
  }), { columns: 3, rows: 3 });

  assert.equal(renderFramePlain(frame), 'abc\ndef');
  assert.equal(frame.accessibility.root.description, 'Showing 1-2 of 2 log rows. Omitted before: 0. Omitted after: 0. Follow tail: true.');
  assert.deepEqual(frame.accessibility.root.children?.map((node) => node.value), ['abc', 'def']);
});

test('log viewer search navigates to the first match and exposes match segments', () => {
  const entries = Array.from({ length: 12 }, (_value, index) => entry(index, index === 8 ? 'needle row' : `plain ${index}`));
  const element = logViewer({ id: 'search-log', history: prepareLogHistory(entries), searchQuery: 'needle' });
  const frame = renderElementFrame(element, { columns: 40, rows: 5 });

  const matchedCells = frame.cells.filter((cell) => cell.source?.description === 'body.match');
  assert.equal(matchedCells.map((cell) => cell.text).join(''), 'needle');
  assert.equal(matchedCells.every((cell) => cell.style?.fg?.token === 'menu.match'), true);
  assert.equal(frame.cells.some((cell) => cell.source?.description === 'body' && cell.text === ' '), true);
  assert.match(renderFramePlain(frame), /needle row/u);
  assert.ok(frame.accessibility.root.children?.some((node) => node.description === 'Search match.'));
  assert.equal(
    frame.accessibility.root.description,
    'Showing 7-11 of 12 log rows. Omitted before: 6. Omitted after: 1. Follow tail: false. Search query: needle. Matching entries: 1.'
  );
});

test('wrapped log viewer search centers the row containing the first highlight', () => {
  const frame = renderElementFrame(logViewer({
    id: 'wrapped-search-log',
    history: prepareLogHistory([{
      id: 'long-record',
      text: `${'prefix '.repeat(12)}needle suffix`
    }]),
    searchQuery: 'needle',
    wrap: true
  }), { columns: 8, rows: 5 });
  const matches = frame.cells.filter((cell) => cell.source?.partType === 'match');

  assert.equal(matches.map((cell) => cell.text).join(''), 'needle');
});

test('wrapped log viewer search navigates by exact occurrence identity', () => {
  const history = prepareLogHistory([{
    id: 'long-record',
    text: `needle ${'padding '.repeat(8)}needle suffix`
  }]);
  const matches = logViewerSearchMatches(history, 'needle');
  const frame = renderElementFrame(logViewer({
    id: 'selected-search-occurrence',
    history,
    searchQuery: 'needle',
    selectedMatch: matches[1],
    wrap: true
  }), { columns: 8, rows: 3 });

  assert.equal(matches.length, 2);
  assert.equal(
    frame.cells.filter((cell) => cell.source?.partType === 'match').map((cell) => cell.text).join(''),
    'needle'
  );
  assert.doesNotMatch(renderFramePlain(frame), /^needle/u);
});

test('log viewer counts only queries represented by highlighted spans', () => {
  const frame = renderElementFrame(logViewer({
    id: 'span-scoped-search',
    history: prepareLogHistory([{ id: 'split-boundary', timestamp: 'a', text: 'b' }]),
    searchQuery: '] b'
  }), { columns: 40, rows: 2 });

  assert.equal(renderFramePlain(frame), '[a] b');
  assert.equal(frame.cells.some((cell) => cell.source?.partType === 'match'), false);
  assert.equal(frame.accessibility.root.children?.[0]?.description, undefined);
  assert.equal(
    frame.accessibility.root.description,
    'Showing 1-1 of 1 log rows. Omitted before: 0. Omitted after: 0. Follow tail: true. Search query: ] b. Matching entries: 0.'
  );
});

test('log viewer search rejects code-unit substrings inside one grapheme', () => {
  const frame = renderElementFrame(logViewer({
    id: 'grapheme-scoped-search',
    history: prepareLogHistory([{ id: 'family', text: 'team 👨‍👩‍👧‍👦' }]),
    searchQuery: '👨'
  }), { columns: 40, rows: 2 });

  assert.equal(frame.cells.some((cell) => cell.source?.partType === 'match'), false);
  assert.equal(
    frame.accessibility.root.description,
    'Showing 1-1 of 1 log rows. Omitted before: 0. Omitted after: 0. Follow tail: true. Search query: 👨. Matching entries: 0.'
  );
});

test('log viewer search reuses retained segment indexes and invalidates only appended segments', () => {
  const history = prepareLogHistory(Array.from(
    { length: 100 },
    (_value, index) => entry(index, `record ${index} searchable`)
  ));
  const searched = logViewer({ id: 'retained-search', history, searchQuery: 'searchable' });

  renderElementFrame(searched, { columns: 40, rows: 5 });
  const afterFirst = logViewerSearchStatistics(history);
  renderElementFrame(searched, { columns: 40, rows: 5 });
  const afterSecond = logViewerSearchStatistics(history);

  assert.deepEqual(afterSecond, afterFirst);

  const appended = appendLogHistory(history, [{ id: 'new-record', text: 'searchable append' }]);
  renderElementFrame(
    logViewer({ id: 'retained-search-appended', history: appended, searchQuery: 'searchable' }),
    { columns: 40, rows: 5 }
  );
  const afterAppend = logViewerSearchStatistics(appended);

  assert.equal(afterAppend.queryEvaluations - afterSecond.queryEvaluations, 1);
  assert.equal(afterAppend.recordEvaluations - afterSecond.recordEvaluations, 1);
});

test('log viewer renders empty and selected text states in high contrast and no color output', () => {
  const emptyFrame = renderElementFrame(logViewer({
    id: 'empty-log',
    history: prepareLogHistory([])
  }), { columns: 32, rows: 3 }, { theme: highContrastTheme });
  const selectedFrame = renderElementFrame(logViewer({
    id: 'selected-log',
    history: prepareLogHistory([
      { id: 'alpha', text: 'alpha' },
      { id: 'bravo', text: 'bravo charlie' }
    ]),
    selection: {
      anchor: { entryId: 'alpha', offset: 3 },
      focus: { entryId: 'bravo', offset: 5 }
    }
  }), { columns: 32, rows: 4 }, { theme: highContrastTheme });
  const highContrast = createVisualSnapshot({
    frame: selectedFrame,
    ansi: { capabilities: colorCapabilities(), theme: highContrastTheme }
  });
  const noColor = createVisualSnapshot({
    frame: selectedFrame,
    ansi: { capabilities: noColorCapabilities(), theme: highContrastTheme }
  });

  assert.equal(renderFramePlain(emptyFrame), 'No log entries');
  assert.equal(emptyFrame.cells.find((cell) => cell.text === 'N')?.source?.description, 'empty');
  assert.equal(renderFramePlain(selectedFrame), 'alpha\nbravo charlie');
  assert.equal(selectedFrame.cells.find((cell) => cell.source?.description === 'body.selection')?.style?.bg?.token, 'selection.background');
  assert.equal(highContrast.plainTextFrame, noColor.plainTextFrame);
  assert.doesNotMatch(noColor.ansiFrame, /\\x1b\[[0-9;]*m/u);
});

test('log viewer selection extraction is pure and sanitized', () => {
  const entries = [
    entry(0, 'alpha'),
    entry(1, 'bravo \u001B[31mcharlie\u001B[0m')
  ];
  const text = extractLogViewerSelectionText({
    history: prepareLogHistory(entries),
    selection: {
      anchor: { entryId: 'row-0', offset: 3 },
      focus: { entryId: 'row-1', offset: 12 }
    }
  });

  assert.equal(text, 'ha\nbravo charli');
});

test('log viewer maps pointer selection through metadata to canonical body offsets', () => {
  const regions = renderElementRegions(logViewer({
    id: 'selectable-log',
    history: prepareLogHistory([
      { id: 'alpha', timestamp: '10:30', metadata: { source: 'worker' }, text: 'alpha' },
      { id: 'bravo', text: 'bravo' }
    ]),
    scroll: createScrollState({ offsetRow: 0, contentRows: 2, viewportRows: 2 }),
    onAction: (action) => ({ action })
  }), { columns: 48, rows: 2 });
  const target = targetById(regions, 'selectable-log:text');
  const frame = renderElementFrame(logViewer({
    id: 'selectable-log',
    history: prepareLogHistory([
      { id: 'alpha', timestamp: '10:30', metadata: { source: 'worker' }, text: 'alpha' },
      { id: 'bravo', text: 'bravo' }
    ]),
    scroll: createScrollState({ offsetRow: 0, contentRows: 2, viewportRows: 2 }),
    onAction: (action) => ({ action })
  }), { columns: 48, rows: 2 });
  const alpha = frame.cells.find((cell) => cell.source?.partName === 'body' && cell.text === 'p');
  const bravo = frame.cells.find((cell) => cell.source?.itemId === 'bravo' && cell.text === 'a');
  assert.ok(alpha);
  assert.ok(bravo);
  const press = pointerAt(target, 'pointerDown', alpha.row, alpha.column);
  const drag = pointerAt(target, 'drag', bravo.row, bravo.column, alpha);

  assert.deepEqual(target.focus, { kind: 'focus', path: ['selectable-log'] });
  assert.deepEqual(target.message(press)?.action, {
    kind: 'pointer',
    action: { kind: 'placeCaret', position: { entryId: 'alpha', offset: 2 } }
  });
  assert.deepEqual(target.message(drag)?.action, {
    kind: 'pointer',
    action: {
      kind: 'extendSelection',
      anchor: { entryId: 'alpha', offset: 2 },
      position: { entryId: 'bravo', offset: 2 }
    }
  });
});

test('wrapped log viewer preserves selected body source and visual style', () => {
  const frame = renderElementFrame(logViewer({
    id: 'wrapped-selection',
    history: prepareLogHistory([{ id: 'alpha', text: 'alpha bravo' }]),
    wrap: true,
    selection: {
      anchor: { entryId: 'alpha', offset: 2 },
      focus: { entryId: 'alpha', offset: 8 }
    }
  }), { columns: 5, rows: 4 });
  const selected = frame.cells.filter((cell) => cell.source?.partName === 'body.selection');

  assert.equal(selected.map((cell) => cell.text).join(''), 'pha br');
  assert.equal(selected.every((cell) => cell.style?.bg?.token === 'selection.background'), true);
  assert.ok(new Set(selected.map((cell) => cell.row)).size > 1);
});

test('wrapped log viewer selection does not alter cached row geometry', () => {
  const frame = renderElementFrame(logViewer({
    id: 'wrapped-selection-markers',
    history: prepareLogHistory([{ id: 'alpha', text: 'abcd' }]),
    wrap: true,
    selection: {
      anchor: { entryId: 'alpha', offset: 1 },
      focus: { entryId: 'alpha', offset: 2 }
    }
  }), { columns: 4, rows: 2 });

  assert.equal(renderFramePlain(frame), 'abcd');
  assert.equal(
    frame.accessibility.root.description,
    'Showing 1-1 of 1 log rows. Omitted before: 0. Omitted after: 0. Follow tail: true. Selection length: 1.'
  );
  assert.equal(frame.accessibility.root.children?.length, 1);
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
