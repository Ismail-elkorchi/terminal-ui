import assert from 'node:assert/strict';
import test from 'node:test';
import { paintTextArea } from '../../../dist/components/text-area/paint.js';
import { createTextAreaModel } from '../../../dist/components/text-area/model.js';
import { textAreaGeometry } from '../../../dist/components/text-area/geometry.js';
import { createTextDocument, defaultTextWidthProfile } from '../../../dist/text/index.js';
import { defaultTheme } from '../../../dist/theme/index.js';
import { createFrameBuffer } from '../../../dist/renderer/frame-buffer.js';
import { createLocalComponentRenderTarget } from '../../../dist/renderer/internal/scoped-render-target.js';

const huge = 2 ** 31 - 1;
const background = { bg: { kind: 'theme', token: 'editor.gutter.background' } };

function inputFor({ text = 'a', bounds = { row: 0, column: 0, width: huge, height: huge },
  viewport = { row: 0, column: 0, width: 8, height: 3 }, options = {}, backgrounds = true } = {}) {
  const writes = [];
  const input = {
    model: createTextAreaModel({ state: { document: createTextDocument(text),
      caret: { position: { offset: 0, affinity: 'downstream' } },
      scroll: { offsetRow: 0, offsetColumn: 0, followTail: false } }, ...options }),
    bounds, viewport, theme: defaultTheme, widthProfile: defaultTextWidthProfile,
    disabled: false, busy: false, readOnly: false, inert: false, focus: 'self',
    style: ({ base }) => backgrounds ? { ...base, ...background } : undefined,
    frameSource: value => value,
    target: { width: bounds.width, height: bounds.height, widthProfile: defaultTextWidthProfile,
      write(row, column, spans) {
        assert.ok(writes.length < 64, 'paint work must be bounded by the tiny viewport');
        for (const span of spans) assert.ok(span.text.length < 256, 'paint must not allocate logical-width text');
        writes.push({ row, column, spans });
      } },
  };
  return { input, writes };
}

function boundedPaint(input) {
  const repeat = String.prototype.repeat;
  const padStart = String.prototype.padStart;
  String.prototype.repeat = function(count) {
    assert.ok(count < 256, 'background allocation must be clipped before repeat');
    return repeat.call(this, count);
  };
  String.prototype.padStart = function(length, fill) {
    assert.ok(length < 256, 'line-number padding must be clipped before allocation');
    return padStart.call(this, length, fill);
  };
  try { paintTextArea(input); }
  finally { String.prototype.repeat = repeat; String.prototype.padStart = padStart; }
}

function partWrites(writes, description) {
  return writes.filter(write => write.spans.some(span => span.source?.description === description));
}

test('huge textarea root, gutter and active-line planes allocate only their visible intersections', () => {
  const { input, writes } = inputFor({ options: { highlightActiveLine: true } });
  const geometry = textAreaGeometry(input);
  boundedPaint(input);
  for (const [description, column, width, rows] of [
    ['root.background', 0, 8, 3], ['gutter.background', 0, 2, 3], ['activeLine.background', 2, 6, 1],
  ]) {
    const planes = partWrites(writes, description);
    assert.equal(planes.length, rows, description);
    assert.deepEqual(planes.map(write => write.row), Array.from({ length: rows }, (_, row) => row));
    assert.ok(planes.every(write => write.column === column && write.spans[0].text === ' '.repeat(width)));
  }
  assert.strictEqual(textAreaGeometry(input), geometry);
  assert.equal(geometry.scrollbar.contentBounds.width, huge - 2);
  assert.equal(geometry.scrollbar.contentBounds.height, huge);
});

test('gutter background reaches unused clipped rows near the end of a huge logical editor', () => {
  const viewport = { row: huge - 2, column: 1, width: 7, height: 2 };
  const { input, writes } = inputFor({ viewport });
  boundedPaint(input);
  const gutter = partWrites(writes, 'gutter.background');
  assert.deepEqual(gutter.map(write => [write.row, write.column, write.spans[0].text]), [
    [huge - 2, 1, ' '], [huge - 1, 1, ' '],
  ]);
  assert.equal(writes.length, 4, 'only root and gutter backgrounds are needed after the last document line');
});

test('pending and fully clipped huge textareas do not paint a full logical plane', () => {
  const pending = inputFor({ options: { preparedLayout: null, onLayoutRequest: () => ({ kind: 'request' }) } });
  boundedPaint(pending.input);
  assert.equal(partWrites(pending.writes, 'root.background').length, 3);
  assert.equal(partWrites(pending.writes, 'layout.pending').length, 1);
  const hidden = inputFor({ viewport: { row: huge, column: 0, width: 8, height: 3 } });
  boundedPaint(hidden.input);
  assert.deepEqual(hidden.writes, []);
});

test('textarea skips offscreen document rows without changing the logical row mapping', () => {
  const { input, writes } = inputFor({ text: Array.from({ length: 10_000 }, (_, row) => `line ${row}`).join('\n'),
    viewport: { row: 5_000, column: 0, width: 16, height: 2 }, backgrounds: false });
  textAreaGeometry(input);
  boundedPaint(input);
  assert.deepEqual(partWrites(writes, 'value').map(write => [write.row, write.spans[0].text]), [
    [5_000, 'line 5000'], [5_001, 'line 5001'],
  ]);
  assert.equal(writes.length, 4);
});

test('huge line-number padding preserves visible digits, separator and full logical gutter width', () => {
  const bounds = { row: 0, column: 0, width: huge + 8, height: huge };
  const viewport = { row: 0, column: huge - 3, width: 8, height: 1 };
  const { input, writes } = inputFor({ bounds, viewport, options: { lineNumbers: { minWidth: huge } } });
  boundedPaint(input);
  const numbers = partWrites(writes, 'lineNumber');
  assert.deepEqual(numbers.map(write => [write.column, write.spans[0].text]), [[huge - 3, '   1']]);
  const separator = partWrites(writes, 'gutter.separator');
  assert.equal(separator[0].column, huge + 1);
  assert.equal(separator[0].spans[0].text, ` ${defaultTheme.tokens.symbols.borderSingle.vertical} `);
  assert.equal(textAreaGeometry(input).prefixWidth, huge + 4);
  assert.equal(partWrites(writes, 'value')[0].column, huge + 4);
});

test('huge always-visible textarea scrollbars do no offscreen track work', () => {
  const { input, writes } = inputFor({ options: { scrollbar: { visible: 'always', axis: 'both' } } });
  boundedPaint(input);
  assert.equal(writes.filter(write => write.spans.some(span => span.source?.cellRole === 'scrollbar')).length, 0);
  assert.equal(textAreaGeometry(input).scrollbar.contentBounds.height, huge - 1);
});

test('textarea constructs only the clipped text window of a long logical line', () => {
  const { input, writes } = inputFor({ text: '0123456789'.repeat(10_000),
    viewport: { row: 0, column: 50_002, width: 8, height: 1 } });
  textAreaGeometry(input);
  boundedPaint(input);
  assert.deepEqual(partWrites(writes, 'value').map(write => [write.column, write.spans[0].text]), [[50_002, '01234567']]);
  assert.equal(textAreaGeometry(input).scrollbar.contentBounds.width, huge - 2);
});

function paintedCells(input, clip, painterViewport) {
  const buffer = createFrameBuffer(input.bounds.width, input.bounds.height);
  const target = createLocalComponentRenderTarget(buffer,
    { ...input.bounds, row: 1, column: 1 },
    { ...clip, row: clip.row + 1, column: clip.column + 1 },
    { name: 'textarea-paint-test' });
  try { paintTextArea({ ...input, viewport: painterViewport, target: target.target }); }
  finally { target.close(); }
  return buffer.snapshot().cells;
}

test('viewport-bounded painting matches full logical painting clipped at the target, including Unicode and editor anatomy', () => {
  const text = 'a界é🙂b 0123456789\nsecond 界🙂 line\nthird';
  const bounds = { row: 0, column: 0, width: 24, height: 5 };
  for (const wrap of [false, true]) {
    for (const lineNumbers of [false, { minWidth: 5, startNumber: -13 }]) {
      for (const offsetColumn of [0, 1, 2, 3]) {
        const { input } = inputFor({ bounds, text, options: {
          wrap, lineNumbers, highlightActiveLine: true, error: 'Invalid',
          state: { document: createTextDocument(text),
            caret: { position: { offset: 0, affinity: 'downstream' } },
            selection: { anchor: { offset: 2, affinity: 'downstream' }, focus: { offset: 8, affinity: 'upstream' } },
            scroll: { offsetRow: 0, offsetColumn, followTail: false } },
          scrollbar: { visible: 'always', axis: 'both' },
        } });
        for (const clip of [
          { row: 0, column: 0, width: 5, height: 2 },
          { row: 0, column: 3, width: 7, height: 3 },
          { row: 0, column: 4, width: 1, height: 2 },
          { row: 1, column: 5, width: 8, height: 4 },
          { row: 0, column: 8, width: 8, height: 4 },
          { row: 1, column: 20, width: 4, height: 4 },
        ]) {
          assert.deepEqual(paintedCells(input, clip, clip), paintedCells(input, clip, bounds),
            JSON.stringify({ wrap, lineNumbers, offsetColumn, clip }));
        }
      }
    }
  }
});
