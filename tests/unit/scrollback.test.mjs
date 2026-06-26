import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createScrollState,
  extractScrollbackSelectionText,
  layoutWidget,
  renderFrame,
  renderWidgetFrame,
  scrollbackWindow
} from '../../dist/tui/index.js';
import { scrollback } from '../../dist/widgets/index.js';

function item(index, text = `Row ${index}`) {
  return { id: `row-${index}`, text };
}

test('scrollback follows the tail by default and marks omitted earlier rows', () => {
  const items = Array.from({ length: 20 }, (_value, index) => item(index));
  const frame = renderWidgetFrame(scrollback({ id: 'log', items }), { columns: 36, rows: 4 });
  const output = renderFrame(frame);

  assert.match(output, /\.\.\. 16 earlier rows omitted \.\.\./u);
  assert.match(output, /Row 17/u);
  assert.match(output, /Row 18/u);
  assert.match(output, /Row 19/u);
  assert.doesNotMatch(output, /Row 0/u);
  assert.equal(frame.accessibility.root.description, 'Showing 17-20 of 20 scrollback rows. Omitted before: 16. Omitted after: 0.');
  assert.equal(frame.accessibility.root.children?.length, 4);
});

test('scrollback accepts explicit scroll state and marks omitted later rows', () => {
  const items = Array.from({ length: 10 }, (_value, index) => item(index));
  const frame = renderWidgetFrame(scrollback({
    id: 'log',
    items,
    scroll: createScrollState({ offsetRow: 0, contentRows: 10, viewportRows: 3 })
  }), { columns: 36, rows: 3 });
  const output = renderFrame(frame);

  assert.match(output, /Row 0/u);
  assert.match(output, /Row 1/u);
  assert.match(output, /\.\.\. 7 later rows omitted \.\.\./u);
  assert.doesNotMatch(output, /Row 9/u);
  assert.equal(frame.accessibility.root.description, 'Showing 1-3 of 10 scrollback rows. Omitted before: 0. Omitted after: 7.');
});

test('scrollback sanitizes terminal control sequences before rendering and accessibility', () => {
  const frame = renderWidgetFrame(scrollback({
    id: 'safe-log',
    items: [item(0, 'safe \u001B[31mred\u001B[0m text')]
  }), { columns: 40, rows: 2 });
  const output = renderFrame(frame);

  assert.equal(output, 'safe red text');
  assert.equal(frame.accessibility.root.children?.[0]?.value, 'safe red text');
});

test('scrollback wraps visible rows when requested', () => {
  const frame = renderWidgetFrame(scrollback({
    id: 'wrapped-log',
    items: [item(0, 'abcdef')],
    wrap: true
  }), { columns: 3, rows: 3 });

  assert.equal(renderFrame(frame), 'abc\ndef');
  assert.equal(frame.accessibility.root.description, 'Showing 1-2 of 2 scrollback rows. Omitted before: 0. Omitted after: 0.');
  assert.deepEqual(frame.accessibility.root.children?.map((node) => node.value), ['abc', 'def']);
});

test('scrollback search navigates to the first match and exposes match segments', () => {
  const items = Array.from({ length: 12 }, (_value, index) => item(index, index === 8 ? 'needle row' : `plain ${index}`));
  const widget = scrollback({ id: 'search-log', items, searchQuery: 'needle' });
  const layout = layoutWidget(widget, { columns: 40, rows: 5 });
  const window = scrollbackWindow(widget, layout);
  const frame = renderWidgetFrame(widget, { columns: 40, rows: 5 });

  assert.equal(window.matchCount, 1);
  assert.ok(window.rows.some((row) => row.text === 'needle row' && row.matched === true));
  assert.deepEqual(
    window.rows.find((row) => row.text === 'needle row')?.segments,
    [
      { text: 'needle', tone: 'accent', emphasis: 'underline', matched: true },
      { text: ' row' }
    ]
  );
  assert.match(renderFrame(frame), /needle row/u);
  assert.ok(frame.accessibility.root.children?.some((node) => node.description === 'Search match.'));
  assert.equal(
    frame.accessibility.root.description,
    'Showing 7-11 of 12 scrollback rows. Omitted before: 6. Omitted after: 1. Search query: needle. Matches in rows: 1.'
  );
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
