import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createFrameBuffer,
  diffFrames,
  frameCellSource,
  renderDiffAnsi,
  renderFrameAnsi,
  renderFramePlain,
  sanitizeFrameCellSource
} from '../../dist/renderer/index.js';
import { richText } from '../../dist/components/index.js';
import { renderElementFrame } from '../../dist/renderer/index.js';
import { blitFrameCell } from '../../dist/renderer/internal/frame-buffer.js';

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
    source: { ownerId: 'title', ownerKind: 'example', family: 'test', role: 'heading', part: 'title', label: 'Title' }
  }]);
  const [first, second] = buffer.snapshot().cells;

  assert.deepEqual(first?.style, { bold: true, fg: { kind: 'theme', token: 'accent.primary' } });
  assert.deepEqual(second?.link, { href: 'https://example.test', id: 'doc' });
  assert.deepEqual(first?.source, { ownerId: 'title', ownerKind: 'example', family: 'test', role: 'heading', part: 'title', label: 'Title' });
});

test('FrameCellSource sanitizes stable structured metadata before entering frames', () => {
  const sanitized = sanitizeFrameCellSource({
    ownerId: 'owner\u001B[31m',
    ownerKind: 'widget',
    family: 'text',
    role: 'text',
    part: 'body',
    partKind: 'segment',
    itemId: 'item',
    itemIndex: 2.9,
    state: 'selected',
    label: 'Title',
    ignored: 'legacy'
  });

  assert.deepEqual(sanitized, {
    ownerId: 'owner',
    ownerKind: 'widget',
    family: 'text',
    role: 'text',
    part: 'body',
    partKind: 'segment',
    itemId: 'item',
    itemIndex: 2,
    state: 'selected',
    label: 'Title'
  });
  assert.equal(Object.isFrozen(sanitized), true);
  assert.equal(sanitizeFrameCellSource(sanitized), sanitized);
  assert.equal(
    sanitizeFrameCellSource({ ownerId: 'cell', itemIndex: 0 }),
    sanitizeFrameCellSource({ ownerId: 'cell', itemIndex: 0 })
  );

  const buffer = createFrameBuffer(4, 1);
  buffer.write(1, 1, [{ text: 'A', source: frameCellSource({ ownerId: 'cell', kind: 'legacy', itemIndex: -1 }) }]);
  assert.deepEqual(buffer.snapshot().cells[0]?.source, { ownerId: 'cell', itemIndex: 0 });
});

test('FrameCellSource interaction states agree across cleanup, frames, and schemas', () => {
  const states = ['focused', 'hovered', 'pressed', 'selected', 'disabled', 'active'];
  const buffer = createFrameBuffer(states.length, 1);

  for (const [index, state] of states.entries()) {
    buffer.write(1, index + 1, [{
      text: String(index),
      source: frameCellSource({ ownerId: `cell-${String(index)}`, state })
    }]);
  }
  assert.deepEqual(buffer.snapshot().cells.map((cell) => cell.source?.state), states);

  const schemaStates = [
    ['tui-frame.schema.json', (schema) => schema.$defs.frameCellSource.properties.state.enum],
    ['render-diff.schema.json', (schema) => schema.$defs.frameCellSource.properties.state.enum],
    ['interaction-transcript.schema.json', (schema) => schema.$defs.frameCellSource.properties.state.enum]
  ];
  for (const [filename, getStates] of schemaStates) {
    const schema = JSON.parse(readFileSync(
      new URL(`../../schemas/${filename}`, import.meta.url),
      'utf8'
    ));
    assert.deepEqual(getStates(schema), states, filename);
  }
});

test('FrameCellSource rejects unknown interaction values at every frame-buffer entry point', () => {
  assert.throws(
    () => sanitizeFrameCellSource({ ownerId: 'invalid', state: 'busy' }),
    /Frame cell source state/u
  );

  const written = createFrameBuffer(1, 1);
  assert.throws(
    () => written.write(1, 1, [{ text: 'x', source: { state: 'busy' } }]),
    /Frame cell source state/u
  );

  const blitted = createFrameBuffer(1, 1);
  assert.throws(
    () => blitFrameCell(blitted, {
      row: 1,
      column: 1,
      text: 'x',
      width: 1,
      source: { state: 'busy' }
    }),
    /Frame cell source state/u
  );

  const cursor = createFrameBuffer(1, 1);
  assert.throws(
    () => cursor.snapshot({
      cursor: { row: 1, column: 1, source: { state: 'busy' } }
    }),
    /Frame cell source state/u
  );
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

test('FrameBuffer compacts dense write coverage at snapshot time', () => {
  const buffer = createFrameBuffer(40, 10);
  for (let row = 1; row <= 10; row += 1) {
    buffer.write(row, 1, [{ text: 'X'.repeat(40) }]);
  }

  assert.deepEqual(buffer.snapshot().metadata.writtenBounds.rects, [
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
  const frame = renderElementFrame(richText({
    id: 'styled',
    segments: [
      { kind: 'text', text: 'Error', style: { fg: { kind: 'theme', token: 'status.error' }, bold: true } },
      { kind: 'text', text: ' muted', style: { fg: { kind: 'theme', token: 'text.muted' } } }
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
  beforeSource.write(1, 1, [{ text: 'src', source: { ownerId: 'old', ownerKind: 'test' } }]);
  const afterSource = createFrameBuffer(12, 1);
  afterSource.write(1, 1, [{ text: 'src', source: { ownerId: 'new', ownerKind: 'test' } }]);

  assert.deepEqual(diffFrames(beforeLink.snapshot(), afterLink.snapshot()).operations, [
    { kind: 'write', row: 1, column: 1, spans: [{ text: 'doc', link: { href: 'https://new.example' } }] }
  ]);
  assert.deepEqual(diffFrames(beforeSource.snapshot(), afterSource.snapshot()).operations, [
    { kind: 'write', row: 1, column: 1, spans: [{ text: 'src', source: { ownerId: 'new', ownerKind: 'test' } }] }
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
  assert.match(output, /\u001B\[3H   Z/u);
});

test('renderDiffAnsi serializes styled spans according to terminal color capability', () => {
  const diff = {
    schemaVersion: 'terminal-ui.render-diff.v2',
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
  assert.equal(noColor, '\u001B[HHi');
});

test('renderDiffAnsi gates OSC 8 hyperlinks by capability and option', () => {
  const diff = {
    schemaVersion: 'terminal-ui.render-diff.v2',
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
    schemaVersion: 'terminal-ui.render-diff.v2',
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
    schemaVersion: 'terminal-ui.render-diff.v2',
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
    schemaVersion: 'terminal-ui.render-diff.v2',
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
      widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
      bidi: 'stable-fallback'
    },
    rawInput: support(true),
    resize: support(true),
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
    clipboard: support(false),
    diagnostics: []
  };
}
