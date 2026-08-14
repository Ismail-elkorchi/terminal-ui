import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFrameBuffer,
  diffFrames,
  frameCellSource,
  renderDiffAnsi,
  renderFrameAnsi,
  renderFramePlain
} from '../../dist/renderer/index.js';
import { richText } from '../../dist/components/index.js';
import { renderElementFrame } from '../../dist/renderer/index.js';
import { blitFrameCell } from '../../dist/renderer/internal/frame-buffer.js';
import { createClippedRenderTarget } from '../../dist/renderer/internal/scoped-render-target.js';
import { frameSnapshotMetadata } from '../../dist/renderer/internal/frame-snapshot.js';
import { defineTextWidthProfile } from '../../dist/text/index.js';

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

test('canonical width profiles retain identity and clipped targets batch visible runs', () => {
  const widthProfile = defineTextWidthProfile({ emoji: 'wide', ambiguous: 'narrow' });
  assert.strictEqual(defineTextWidthProfile(widthProfile), widthProfile);
  assert.strictEqual(createFrameBuffer(2, 1, { widthProfile }).widthProfile, widthProfile);

  const writes = [];
  const target = {
    width: 100,
    height: 1,
    widthProfile,
    write: (row, column, spans) => writes.push({ row, column, spans }),
    writeLine() {},
    writeBlock() {},
    writeCell() {},
    clear() {}
  };
  const clipped = createClippedRenderTarget(
    target,
    { row: 1, column: 1, width: 100, height: 1 },
    { row: 1, column: 1, width: 100, height: 1 }
  );
  clipped.write(1, 1, [{ text: 'x'.repeat(100) }]);

  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.spans[0]?.text, 'x'.repeat(100));
});

test('FrameBuffer excludes terminal movement controls from cell text and geometry', () => {
  const buffer = createFrameBuffer(8, 1);
  buffer.write(1, 1, [{ text: 'a\tb\nc\rd' }]);
  const frame = buffer.snapshot();

  assert.equal(renderFramePlain(frame), 'abcd');
  assert.deepEqual(frame.cells.map((cell) => cell.text), ['a', 'b', 'c', 'd']);
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
    source: {
      elementId: 'title',
      elementKind: 'example',
      rendererFamily: 'test',
      cellRole: 'text',
      partName: 'title',
      description: 'Title'
    }
  }]);
  const [first, second] = buffer.snapshot().cells;

  assert.deepEqual(first?.style, { bold: true, fg: { kind: 'theme', token: 'accent.primary' } });
  assert.deepEqual(second?.link, { href: 'https://example.test', id: 'doc' });
  assert.deepEqual(first?.source, {
    elementId: 'title',
    elementKind: 'example',
    rendererFamily: 'test',
    cellRole: 'text',
    partName: 'title',
    description: 'Title'
  });
});

test('FrameBuffer snapshots cannot mutate retained cells or their value objects', () => {
  const style = { fg: { kind: 'ansi', value: 2 }, bold: true };
  const buffer = createFrameBuffer(2, 1);
  buffer.write(1, 1, [{
    text: 'A',
    style,
    link: { href: 'https://example.test' },
    source: { elementId: 'immutable-cell' }
  }]);
  const frame = buffer.snapshot();
  const cell = frame.cells[0];

  assert.equal(Object.isFrozen(frame), true);
  assert.equal(Object.isFrozen(cell), true);
  assert.equal(Object.isFrozen(cell.style), true);
  assert.equal(Object.isFrozen(cell.style.fg), true);
  assert.equal(Object.isFrozen(cell.link), true);
  assert.equal(Object.isFrozen(cell.source), true);
  assert.throws(() => { cell.text = 'B'; }, TypeError);
  assert.throws(() => { cell.style.bold = false; }, TypeError);
  style.bold = false;
  assert.equal(buffer.readCell(1, 1)?.style?.bold, true);
  assert.equal(diffFrames(frame, buffer.snapshot()).operations.length, 0);
});

test('FrameBuffer rejects unsafe and unbounded dense allocations', () => {
  assert.throws(() => createFrameBuffer(Number.MAX_SAFE_INTEGER, 0), /frame width must not exceed/u);
  assert.throws(() => createFrameBuffer(1_001, 1_000), /must not exceed 1000000 cells/u);
  assert.throws(() => createFrameBuffer(Number.NaN, 1), /non-negative safe integer/u);
});

test('public FrameBuffer writes replace earlier backgrounds', () => {
  const buffer = createFrameBuffer(2, 1);
  buffer.write(1, 1, [{
    text: ' ',
    style: { bg: { kind: 'theme', token: 'surface.background' } }
  }]);
  buffer.write(1, 1, [{ text: 'A' }]);

  assert.equal(buffer.readCell(1, 1)?.style?.bg, undefined);
});

test('FrameCellSource sanitizes stable structured metadata before entering frames', () => {
  const sanitized = frameCellSource({
    elementId: 'owner\u001B[31m',
    elementKind: 'text',
    rendererFamily: 'text',
    cellRole: 'text',
    partName: 'body',
    partType: 'segment',
    itemId: 'item',
    itemIndex: 2,
    interactionState: 'selected',
    description: 'Title',
    ignored: 'discarded'
  });

  assert.deepEqual(sanitized, {
    elementId: 'owner',
    elementKind: 'text',
    rendererFamily: 'text',
    cellRole: 'text',
    partName: 'body',
    partType: 'segment',
    itemId: 'item',
    itemIndex: 2,
    interactionState: 'selected',
    description: 'Title'
  });
  assert.equal(Object.isFrozen(sanitized), true);
  assert.equal(frameCellSource(sanitized), sanitized);

  const buffer = createFrameBuffer(4, 1);
  buffer.write(1, 1, [{ text: 'A', source: frameCellSource({ elementId: 'cell', itemIndex: 0 }) }]);
  assert.deepEqual(buffer.snapshot().cells[0]?.source, { elementId: 'cell', itemIndex: 0 });
});

test('FrameCellSource rejects invalid item indexes', () => {
  for (const itemIndex of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => frameCellSource({ elementId: 'invalid', itemIndex }),
      /Frame cell source itemIndex must be a non-negative integer/u
    );
  }
});

test('FrameCellSource preserves supported interaction states and roles', () => {
  const states = ['focused', 'hovered', 'pressed', 'selected', 'disabled', 'active'];
  const buffer = createFrameBuffer(states.length, 1);

  for (const [index, state] of states.entries()) {
    buffer.write(1, index + 1, [{
      text: String(index),
      source: frameCellSource({ elementId: `cell-${String(index)}`, interactionState: state })
    }]);
  }
  assert.deepEqual(buffer.snapshot().cells.map((cell) => cell.source?.interactionState), states);
});

test('FrameCellSource rejects unknown interaction values at every frame-buffer entry point', () => {
  assert.throws(
    () => frameCellSource({ elementId: 'invalid', cellRole: 'heading' }),
    /Frame cell source cellRole/u
  );
  assert.throws(
    () => frameCellSource({ elementId: 'invalid', interactionState: 'busy' }),
    /Frame cell source interactionState/u
  );

  const written = createFrameBuffer(1, 1);
  assert.throws(
    () => written.write(1, 1, [{ text: 'x', source: { interactionState: 'busy' } }]),
    /Frame cell source interactionState/u
  );

  const blitted = createFrameBuffer(1, 1);
  assert.throws(
    () => blitFrameCell(blitted, {
      row: 1,
      column: 1,
      text: 'x',
      width: 1,
      source: { interactionState: 'busy' }
    }),
    /Frame cell source interactionState/u
  );

  const cursor = createFrameBuffer(1, 1);
  assert.throws(
    () => cursor.snapshot({
      cursor: { row: 1, column: 1, source: { interactionState: 'busy' } }
    }),
    /Frame cell source interactionState/u
  );
});

test('FrameBuffer snapshot metadata records clipped write and clear coverage', () => {
  const buffer = createFrameBuffer(6, 3);
  buffer.write(1, 2, [{ text: 'A界' }]);
  buffer.write(2, -1, [{ text: 'BC' }]);
  buffer.clear({ row: 2, column: 5, width: 10, height: 3 });
  const snapshot = buffer.snapshot();

  assert.deepEqual(frameSnapshotMetadata(snapshot).writtenBounds.rects, [
    { row: 1, column: 2, width: 3, height: 1 }
  ]);
  assert.deepEqual(frameSnapshotMetadata(snapshot).clearedBounds.rects, [
    { row: 2, column: 5, width: 2, height: 2 }
  ]);
});

test('FrameBuffer snapshot metadata marks overwritten wide-glyph spans as written coverage', () => {
  const buffer = createFrameBuffer(4, 1);
  buffer.write(1, 1, [{ text: '界' }]);
  buffer.write(1, 2, [{ text: 'A' }]);

  assert.deepEqual(frameSnapshotMetadata(buffer.snapshot()).writtenBounds.rects, [
    { row: 1, column: 1, width: 2, height: 1 }
  ]);
});

test('FrameBuffer compacts dense write coverage at snapshot time', () => {
  const buffer = createFrameBuffer(40, 10);
  for (let row = 1; row <= 10; row += 1) {
    buffer.write(row, 1, [{ text: 'X'.repeat(40) }]);
  }

  assert.deepEqual(frameSnapshotMetadata(buffer.snapshot()).writtenBounds.rects, [
    { row: 1, column: 1, width: 40, height: 10 }
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

  const firstMetadata = frameSnapshotMetadata(firstSnapshot);
  const secondMetadata = frameSnapshotMetadata(secondSnapshot);
  const changedMetadata = frameSnapshotMetadata(changedSnapshot);
  assert.deepEqual(firstMetadata.rowFingerprints, secondMetadata.rowFingerprints);
  assert.equal(firstMetadata.fingerprint, secondMetadata.fingerprint);
  assert.equal(
    firstMetadata.rowFingerprints[0]?.fingerprint,
    changedMetadata.rowFingerprints[0]?.fingerprint
  );
  assert.notEqual(
    firstMetadata.rowFingerprints[1]?.fingerprint,
    changedMetadata.rowFingerprints[1]?.fingerprint
  );
  assert.notEqual(firstMetadata.fingerprint, changedMetadata.fingerprint);
});

test('frame fingerprints never substitute for exact row equality', () => {
  const previous = createFrameBuffer(12, 1);
  const next = createFrameBuffer(12, 1);
  previous.write(1, 1, [{ text: '$Hs6piQ`fhu.' }]);
  next.write(1, 1, [{ text: '^jgw)a0+D/)I' }]);

  const previousFrame = previous.snapshot();
  const nextFrame = next.snapshot();
  assert.equal(
    frameSnapshotMetadata(previousFrame).rowFingerprints[0]?.fingerprint,
    frameSnapshotMetadata(nextFrame).rowFingerprints[0]?.fingerprint,
  );
  assert.notEqual(renderFramePlain(previousFrame), renderFramePlain(nextFrame));
  assert.notEqual(diffFrames(previousFrame, nextFrame).operations.length, 0);
  assert.equal('metadata' in previousFrame, false);
});

test('richText emits styled cells through render spans', () => {
  const frame = renderElementFrame(richText({
    id: 'styled',
    segments: [
      { kind: 'text', text: 'Error', style: { fg: { kind: 'theme', token: 'status.error' }, bold: true } },
      { kind: 'text', text: ' muted', style: { fg: { kind: 'theme', token: 'text.muted' } } }
    ]
  }), { columns: 20, rows: 2 });

  assert.equal(renderFramePlain(frame), 'Error muted');
  assert.deepEqual(frame.cells[0]?.style, {
    fg: { kind: 'theme', token: 'status.error' },
    bg: { kind: 'theme', token: 'app.background' },
    bold: true
  });
  assert.deepEqual(frame.cells[5]?.style, {
    fg: { kind: 'theme', token: 'text.muted' },
    bg: { kind: 'theme', token: 'app.background' }
  });
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
  beforeSource.write(1, 1, [{ text: 'src', source: { elementId: 'old', elementKind: 'test' } }]);
  const afterSource = createFrameBuffer(12, 1);
  afterSource.write(1, 1, [{ text: 'src', source: { elementId: 'new', elementKind: 'test' } }]);

  assert.deepEqual(diffFrames(beforeLink.snapshot(), afterLink.snapshot()).operations, [
    { kind: 'write', row: 1, column: 1, spans: [{ text: 'doc', link: { href: 'https://new.example' } }] }
  ]);
  assert.deepEqual(diffFrames(beforeSource.snapshot(), afterSource.snapshot()).operations, [
    { kind: 'write', row: 1, column: 1, spans: [{ text: 'src', source: { elementId: 'new', elementKind: 'test' } }] }
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
  const cursorMoves = output.match(/\u001B\[[\d;]*H/gu) ?? [];

  assert.deepEqual(cursorMoves, ['\u001B[H', '\u001B[3H']);
  assert.match(output, /\u001B\[H/u);
  assert.match(output, /AB/u);
  assert.match(output, /CD/u);
  assert.match(output, /\u001B\[3H\u001B\[39m   Z/u);
});

test('renderDiffAnsi serializes styled spans according to terminal color capability', () => {
  const diff = {
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
  assert.equal(noColor, '\u001B[H\u001B[1mHi\u001B[0m');
});

test('renderDiffAnsi gates OSC 8 hyperlinks by capability and option', () => {
  const diff = {
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
  assert.equal(disabled, '\u001B[Hdoc');
});

test('renderDiffAnsi chooses shorter cursor and tail-clear encodings without exceeding the baseline', () => {
  const diff = {
    width: 20,
    height: 4,
    fullRewrite: false,
    operations: [
      { kind: 'write', row: 1, column: 1, spans: [{ text: 'a' }] },
      { kind: 'write', row: 1, column: 3, spans: [{ text: 'b' }] },
      { kind: 'clearRect', bounds: { row: 2, column: 16, width: 5, height: 1 } }
    ],
    cursor: { row: 4, column: 1 }
  };
  const output = renderDiffAnsi(diff, { capabilities: capabilities(8) });
  const baseline = '\u001B[1;1Ha\u001B[1;3Hb\u001B[2;16H     \u001B[4;1H';

  assert.equal(output, '\u001B[Ha\u001B[Cb\u001B[2;16H\u001B[0K\u001B[4H');
  assert.ok(new TextEncoder().encode(output).byteLength <= new TextEncoder().encode(baseline).byteLength);
});

test('renderDiffAnsi emits the structural final cursor without session visibility commands', () => {
  const output = renderDiffAnsi({
    width: 8,
    height: 3,
    fullRewrite: false,
    operations: [{ kind: 'write', row: 2, column: 1, spans: [{ text: 'x' }] }],
    cursor: { row: 3, column: 4 }
  }, { capabilities: capabilities(8) });

  assert.equal((output.match(/\?25[hl]/gu) ?? []).length, 0);
  assert.equal(output.endsWith('\u001B[3;4H'), true);
});

test('renderDiffAnsi wraps non-empty output when synchronized output is explicitly supported', () => {
  const output = renderDiffAnsi({
    width: 4,
    height: 1,
    fullRewrite: false,
    operations: [{ kind: 'write', row: 1, column: 1, spans: [{ text: 'sync' }] }]
  }, { capabilities: capabilities(8, false, true) });

  assert.equal(output, '\u001B[?2026h\u001B[Hsync\u001B[?2026l');
});

function capabilities(depth, hyperlinks = false, synchronizedOutput = false) {
  const support = (supported) => supported
    ? { support: 'supported', availability: 'available', facts: [], diagnostics: [], requiresSessionOperation: false }
    : { support: 'unsupported', availability: 'available', facts: [], diagnostics: [], requiresSessionOperation: false };
  return {
    runtime: 'node',
    isTty: true,
    color: {
      depth,
      hasBasicColors: depth >= 4,
      has256Colors: depth >= 8,
      hasTrueColor: depth === 24
    },
    unicode: {
      graphemeClusters: true,
      widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
      bidi: 'stable-fallback'
    },
    rawInput: support(true),
    resize: support(true),
    textAttributes: support(true),
    hyperlinks: support(hyperlinks),
    keyboardProtocol: support(false),
    bracketedPaste: support(true),
    mouseReporting: support(true),
    alternateScreen: support(true),
    focusReporting: support(true),
    cursorVisibility: support(true),
    synchronizedOutput: support(synchronizedOutput),
    scrollRegion: support(false),
    title: support(true),
    bell: support(true),
    clipboardWrite: support(false),
    diagnostics: []
  };
}
