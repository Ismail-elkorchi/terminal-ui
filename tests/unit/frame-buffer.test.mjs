import assert from 'node:assert/strict';
import test from 'node:test';

import { createFrameBuffer, diffFrames, renderDiffAnsi, renderFrameAnsi, renderFramePlain } from '../../dist/tui/index.js';
import { richText } from '../../dist/widgets/index.js';
import { renderWidgetFrame } from '../../dist/tui/index.js';

test('FrameBuffer records ASCII, Unicode width, emoji, CJK, and combining marks deterministically', () => {
  const buffer = createFrameBuffer(10, 2);
  buffer.write(1, 1, [{ text: 'Aé界🙂e\u0301' }]);
  const frame = buffer.snapshot();

  assert.equal(renderFramePlain(frame), 'Aé界🙂é');
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

  assert.equal(renderFramePlain(buffer.snapshot()), '  AB');
});

test('FrameBuffer clears stale wide-glyph continuation cells when overwritten', () => {
  const buffer = createFrameBuffer(4, 1);
  buffer.write(1, 1, [{ text: '界' }]);
  buffer.write(1, 2, [{ text: 'A' }]);
  const frame = buffer.snapshot();

  assert.equal(renderFramePlain(frame), ' A');
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

test('FrameBuffer snapshot metadata records clipped write and clear coverage', () => {
  const buffer = createFrameBuffer(6, 3);
  buffer.write(1, 2, [{ text: 'A界' }]);
  buffer.write(2, -1, [{ text: 'BC' }]);
  buffer.clear({ row: 2, column: 5, width: 10, height: 3 });
  const snapshot = buffer.snapshot();

  assert.deepEqual(snapshot.metadata.writtenBounds.rects, [
    { row: 1, column: 2, width: 3, height: 1 }
  ]);
  assert.deepEqual(snapshot.metadata.clearedBounds.rects, [
    { row: 2, column: 5, width: 2, height: 2 }
  ]);
});

test('FrameBuffer snapshot metadata marks overwritten wide-glyph spans as written coverage', () => {
  const buffer = createFrameBuffer(4, 1);
  buffer.write(1, 1, [{ text: '界' }]);
  buffer.write(1, 2, [{ text: 'A' }]);

  assert.deepEqual(buffer.snapshot().metadata.writtenBounds.rects, [
    { row: 1, column: 1, width: 2, height: 1 }
  ]);
});

test('FrameBuffer snapshot metadata fingerprints rows and full buffers deterministically', () => {
  const first = createFrameBuffer(6, 2);
  first.write(1, 1, [{ text: 'same' }]);
  const second = createFrameBuffer(6, 2);
  second.write(1, 1, [{ text: 'same' }]);
  const changed = createFrameBuffer(6, 2);
  changed.write(1, 1, [{ text: 'same' }]);
  changed.write(2, 1, [{ text: 'new' }]);

  const firstSnapshot = first.snapshot();
  const secondSnapshot = second.snapshot();
  const changedSnapshot = changed.snapshot();

  assert.deepEqual(firstSnapshot.metadata.rowFingerprints, secondSnapshot.metadata.rowFingerprints);
  assert.equal(firstSnapshot.metadata.fingerprint, secondSnapshot.metadata.fingerprint);
  assert.equal(
    firstSnapshot.metadata.rowFingerprints[0]?.fingerprint,
    changedSnapshot.metadata.rowFingerprints[0]?.fingerprint
  );
  assert.notEqual(
    firstSnapshot.metadata.rowFingerprints[1]?.fingerprint,
    changedSnapshot.metadata.rowFingerprints[1]?.fingerprint
  );
  assert.notEqual(firstSnapshot.metadata.fingerprint, changedSnapshot.metadata.fingerprint);
});

test('richText emits styled cells through render spans', () => {
  const frame = renderWidgetFrame(richText({
    id: 'styled',
    segments: [
      { text: 'Error', style: { fg: { kind: 'theme', token: 'status.error' }, bold: true } },
      { text: ' muted', style: { fg: { kind: 'theme', token: 'text.muted' } } }
    ]
  }), { columns: 20, rows: 2 });

  assert.equal(renderFramePlain(frame), 'Error muted');
  assert.deepEqual(frame.cells[0]?.style, { fg: { kind: 'theme', token: 'status.error' }, bold: true });
  assert.deepEqual(frame.cells[5]?.style, { fg: { kind: 'theme', token: 'text.muted' } });
});

test('diffFrames emits changed span runs instead of whole-line text operations', () => {
  const before = createFrameBuffer(80, 1);
  before.write(1, 1, [{ text: 'abcdefghijklmnopqrstuvwxyz' }]);
  const after = createFrameBuffer(80, 1);
  after.write(1, 1, [{ text: 'abcdefghijklXnopqrstuvwxyz' }]);

  const diff = diffFrames(before.snapshot(), after.snapshot());

  assert.equal(diff.fullRewrite, false);
  assert.deepEqual(diff.operations, [
    { kind: 'write', row: 1, column: 13, spans: [{ text: 'X' }] }
  ]);
});

test('diffFrames clears trailing deletions without rewriting unchanged row prefixes', () => {
  const before = createFrameBuffer(16, 1);
  before.write(1, 1, [{ text: 'prefix-tail' }]);
  const after = createFrameBuffer(16, 1);
  after.write(1, 1, [{ text: 'prefix' }]);

  const diff = diffFrames(before.snapshot(), after.snapshot());

  assert.equal(diff.fullRewrite, false);
  assert.deepEqual(diff.operations, [
    { kind: 'clearRect', bounds: { row: 1, column: 7, width: 5, height: 1 } }
  ]);
});

test('diffFrames emits minimal style-only writes without clearing row tails', () => {
  const before = createFrameBuffer(12, 1);
  before.write(1, 1, [{ text: 'same text' }]);
  const after = createFrameBuffer(12, 1);
  after.write(1, 1, [
    { text: 'same', style: { bold: true } },
    { text: ' text' }
  ]);

  const diff = diffFrames(before.snapshot(), after.snapshot());

  assert.equal(diff.fullRewrite, false);
  assert.deepEqual(diff.operations, [
    { kind: 'write', row: 1, column: 1, spans: [{ text: 'same', style: { bold: true } }] }
  ]);
});

test('diffFrames treats link-only and source-only cell changes as minimal writes', () => {
  const beforeLink = createFrameBuffer(12, 1);
  beforeLink.write(1, 1, [{ text: 'doc', link: { href: 'https://old.example' } }]);
  const afterLink = createFrameBuffer(12, 1);
  afterLink.write(1, 1, [{ text: 'doc', link: { href: 'https://new.example' } }]);
  const beforeSource = createFrameBuffer(12, 1);
  beforeSource.write(1, 1, [{ text: 'src', source: { id: 'old', kind: 'test' } }]);
  const afterSource = createFrameBuffer(12, 1);
  afterSource.write(1, 1, [{ text: 'src', source: { id: 'new', kind: 'test' } }]);

  assert.deepEqual(diffFrames(beforeLink.snapshot(), afterLink.snapshot()).operations, [
    { kind: 'write', row: 1, column: 1, spans: [{ text: 'doc', link: { href: 'https://new.example' } }] }
  ]);
  assert.deepEqual(diffFrames(beforeSource.snapshot(), afterSource.snapshot()).operations, [
    { kind: 'write', row: 1, column: 1, spans: [{ text: 'src', source: { id: 'new', kind: 'test' } }] }
  ]);
});

test('diffFrames clears only the changed wide-glyph run when a wide cell narrows', () => {
  const before = createFrameBuffer(8, 1);
  before.write(1, 1, [{ text: '界abc' }]);
  const after = createFrameBuffer(8, 1);
  after.write(1, 1, [{ text: 'Z abc' }]);

  const diff = diffFrames(before.snapshot(), after.snapshot());

  assert.equal(diff.fullRewrite, false);
  assert.deepEqual(diff.operations, [
    { kind: 'clearRect', bounds: { row: 1, column: 1, width: 2, height: 1 } },
    { kind: 'write', row: 1, column: 1, spans: [{ text: 'Z ' }] }
  ]);
});

test('renderFrameAnsi serializes full frames as row runs instead of per-cell cursor moves', () => {
  const buffer = createFrameBuffer(10, 3);
  buffer.write(1, 1, [
    { text: 'AB', style: { fg: { kind: 'theme', token: 'status.success' } } },
    { text: 'CD', style: { fg: { kind: 'theme', token: 'status.warning' } } }
  ]);
  buffer.write(3, 4, [{ text: 'Z' }]);

  const output = renderFrameAnsi(buffer.snapshot(), { capabilities: capabilities(8) });
  const cursorMoves = output.match(/\u001B\[\d+;\d+H/gu) ?? [];

  assert.deepEqual(cursorMoves, ['\u001B[1;1H', '\u001B[3;1H']);
  assert.match(output, /\u001B\[1;1H/u);
  assert.match(output, /AB/u);
  assert.match(output, /CD/u);
  assert.match(output, /\u001B\[3;1H   Z/u);
});

test('renderDiffAnsi serializes styled spans according to terminal color capability', () => {
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

  const trueColor = renderDiffAnsi(diff, { capabilities: capabilities(24) });
  const color256 = renderDiffAnsi(diff, { capabilities: capabilities(8) });
  const noColor = renderDiffAnsi(diff, { capabilities: capabilities(0) });

  assert.match(trueColor, /\u001B\[1;38;2;12;34;56mHi\u001B\[0m/u);
  assert.match(color256, /\u001B\[1;38;5;\d+mHi\u001B\[0m/u);
  assert.equal(noColor, '\u001B[1;1HHi');
});

test('renderDiffAnsi gates OSC 8 hyperlinks by capability and option', () => {
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

  const enabled = renderDiffAnsi(diff, { capabilities: capabilities(8, true), hyperlinks: true });
  const disabled = renderDiffAnsi(diff, { capabilities: capabilities(8, true), hyperlinks: false });

  assert.ok(enabled.includes('\u001B]8;id=doc;https://example.test\u0007doc\u001B]8;;\u0007'));
  assert.equal(disabled, '\u001B[1;1Hdoc');
});

function capabilities(depth, hyperlinks = false) {
  const support = (supported) => supported
    ? { status: 'supported', confidence: 'detected', facts: [], diagnostics: [], requiresSessionOperation: false }
    : { status: 'unavailable', confidence: 'unavailable', facts: [], diagnostics: [], requiresSessionOperation: false };
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
