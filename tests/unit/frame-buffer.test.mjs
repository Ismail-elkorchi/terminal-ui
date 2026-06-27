import assert from 'node:assert/strict';
import test from 'node:test';

import { createFrameBuffer, diffFrames, renderDiffWithOptions, renderFrame } from '../../dist/tui/index.js';
import { richText } from '../../dist/widgets/index.js';
import { renderWidgetFrame } from '../../dist/tui/index.js';

test('FrameBuffer records ASCII, Unicode width, emoji, CJK, and combining marks deterministically', () => {
  const buffer = createFrameBuffer(10, 2);
  buffer.write(1, 1, [{ text: 'Aé界🙂e\u0301' }]);
  const frame = buffer.snapshot();

  assert.equal(renderFrame(frame), 'Aé界🙂é');
  assert.deepEqual(frame.cells.map((cell) => [cell.column, cell.text, cell.width, cell.continuation === true]), [
    [1, 'A', 1, false],
    [2, 'é', 1, false],
    [3, '界', 2, false],
    [4, '', 0, true],
    [5, '🙂', 2, false],
    [6, '', 0, true],
    [7, 'é', 1, false]
  ]);
});

test('FrameBuffer clips writes to bounds without leaking partial wide glyphs', () => {
  const buffer = createFrameBuffer(4, 1);
  buffer.write(1, 3, [{ text: 'ABCD' }]);
  buffer.write(1, 4, [{ text: '界' }]);

  assert.equal(renderFrame(buffer.snapshot()), '  AB');
});

test('FrameBuffer clears stale wide-glyph continuation cells when overwritten', () => {
  const buffer = createFrameBuffer(4, 1);
  buffer.write(1, 1, [{ text: '界' }]);
  buffer.write(1, 2, [{ text: 'A' }]);
  const frame = buffer.snapshot();

  assert.equal(renderFrame(frame), ' A');
  assert.deepEqual(frame.cells.map((cell) => [cell.column, cell.text, cell.width, cell.continuation === true]), [
    [2, 'A', 1, false]
  ]);
});

test('FrameBuffer preserves style, links, and source metadata per visible cell', () => {
  const buffer = createFrameBuffer(6, 1);
  buffer.write(1, 1, [{
    text: 'Hi',
    style: { bold: true, fg: { kind: 'theme', token: 'accent.primary' } },
    link: { href: 'https://example.test', id: 'doc' },
    source: { id: 'title', kind: 'example', role: 'heading', label: 'Title' }
  }]);
  const [first, second] = buffer.snapshot().cells;

  assert.deepEqual(first?.style, { bold: true, fg: { kind: 'theme', token: 'accent.primary' } });
  assert.deepEqual(second?.link, { href: 'https://example.test', id: 'doc' });
  assert.deepEqual(first?.source, { id: 'title', kind: 'example', role: 'heading', label: 'Title' });
});

test('richText emits styled cells through render spans', () => {
  const frame = renderWidgetFrame(richText({
    id: 'styled',
    segments: [
      { text: 'Error', style: { fg: { kind: 'theme', token: 'status.error' }, bold: true } },
      { text: ' muted', style: { fg: { kind: 'theme', token: 'text.muted' } } }
    ]
  }), { columns: 20, rows: 2 });

  assert.equal(renderFrame(frame), 'Error muted');
  assert.deepEqual(frame.cells[0]?.style, { fg: { kind: 'theme', token: 'status.error' }, bold: true });
  assert.deepEqual(frame.cells[5]?.style, { fg: { kind: 'theme', token: 'text.muted' } });
});

test('diffFrames emits changed span runs instead of whole-line text operations', () => {
  const before = createFrameBuffer(8, 1);
  before.write(1, 1, [{ text: 'abcdef' }]);
  const after = createFrameBuffer(8, 1);
  after.write(1, 1, [{ text: 'abcxef' }]);

  const diff = diffFrames(before.snapshot(), after.snapshot());

  assert.equal(diff.fullRewrite, false);
  assert.deepEqual(diff.operations, [
    { kind: 'clearLine', row: 1, fromColumn: 4 },
    { kind: 'write', row: 1, column: 4, spans: [{ text: 'xef' }] }
  ]);
});

test('renderDiffWithOptions serializes styled spans according to terminal color capability', () => {
  const diff = {
    schemaVersion: 'terminal-ui.render-diff.v1',
    width: 6,
    height: 1,
    fullRewrite: false,
    operations: [{
      kind: 'write',
      row: 1,
      column: 1,
      spans: [{ text: 'Hi', style: { bold: true, fg: { kind: 'rgb', r: 12, g: 34, b: 56 } } }]
    }]
  };

  const trueColor = renderDiffWithOptions(diff, { capabilities: capabilities(24) });
  const color256 = renderDiffWithOptions(diff, { capabilities: capabilities(8) });
  const noColor = renderDiffWithOptions(diff, { capabilities: capabilities(0) });

  assert.match(trueColor, /\u001B\[1;38;2;12;34;56mHi\u001B\[0m/u);
  assert.match(color256, /\u001B\[1;38;5;\d+mHi\u001B\[0m/u);
  assert.equal(noColor, '\u001B[1;1HHi');
});

test('renderDiffWithOptions gates OSC 8 hyperlinks by capability and option', () => {
  const diff = {
    schemaVersion: 'terminal-ui.render-diff.v1',
    width: 4,
    height: 1,
    fullRewrite: false,
    operations: [{
      kind: 'write',
      row: 1,
      column: 1,
      spans: [{ text: 'doc', link: { href: 'https://example.test', id: 'doc' } }]
    }]
  };

  const enabled = renderDiffWithOptions(diff, { capabilities: capabilities(8, true), hyperlinks: true });
  const disabled = renderDiffWithOptions(diff, { capabilities: capabilities(8, true), hyperlinks: false });

  assert.ok(enabled.includes('\u001B]8;id=doc;https://example.test\u0007doc\u001B]8;;\u0007'));
  assert.equal(disabled, '\u001B[1;1Hdoc');
});

function capabilities(depth, hyperlinks = false) {
  const support = (supported) => supported
    ? { supported: true, confidence: 'detected' }
    : { supported: false, confidence: 'known', reason: 'test capability disabled' };
  return {
    schemaVersion: 'terminal-ui.terminal-capabilities.v1',
    runtime: 'node',
    isTty: true,
    color: {
      depth,
      hasBasicColors: depth >= 1,
      has256Colors: depth >= 8,
      hasTrueColor: depth === 24
    },
    unicode: {
      graphemeClusters: true,
      eastAsianWidth: 'narrow',
      emojiWidth: 'wide',
      bidi: 'stable-fallback'
    },
    rawInput: support(true),
    resize: support(true),
    hyperlinks: support(hyperlinks),
    enhancedKeyboard: support(false),
    bracketedPaste: support(true),
    mouseReporting: support(true),
    alternateScreen: support(true),
    focusReporting: support(true),
    cursorVisibility: support(true),
    title: support(true),
    bell: support(true),
    clipboard: support(false),
    diagnostics: []
  };
}
