import assert from 'node:assert/strict';

import { SourceBoundaryIndex } from '../../dist/text/source-boundaries.js';

const runtime = 'Deno' in globalThis ? 'deno' : 'Bun' in globalThis ? 'bun' : 'node';
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const nativeSegment = Intl.Segmenter.prototype.segment;
let comparisons = 0;
let categoryStrings = 0;
let seed = 0x68be17f4;

function nativeOffsets(text) {
  const offsets = [0];
  for (const item of nativeSegment.call(segmenter, text)) offsets.push(item.index + item.segment.length);
  return offsets;
}

function compare(text, label, includeSegments = false) {
  const expected = nativeOffsets(text);
  const index = new SourceBoundaryIndex(text);
  assert.deepEqual(index.offsets(), expected, `${runtime}: ${label}`);
  if (includeSegments) {
    assert.deepEqual(Array.from(index.segments(), item => item.index), expected.slice(0, -1), label);
    assert.equal(Array.from(index.segments(), item => item.segment).join(''), text, label);
    for (const position of [0, 1, 4094, 4095, 4096, 4097, text.length - 1]) {
      if (position < 0 || position >= text.length) continue;
      const right = expected.findIndex(offset => offset > position);
      assert.deepEqual(index.at(position), {
        startOffset: expected[right - 1], endOffsetExclusive: expected[right],
      }, `${label}: at ${position}`);
    }
  }
  comparisons += 1;
  return index;
}

function random(limit) {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) % limit;
}

// All 20 representative-category strings through length four. A NUL separator
// isolates samples; batches cross multiple real 4 KiB implementation windows.
// This is category-exhaustive, rather than exhaustive over all Unicode strings.
const categories = [
  'a', '\r', '\n', '\0', '\u0300', '\u200d', '\u093e', '\u0600', '\u1100', '\u1161',
  '\u11a8', '\uac00', '\uac01', '\u{1f1e6}', '\u{1f469}', '\u0915', '\u094d', '\ud800', '\udc00', '\u200c',
];
let batch = '';
function exhaustive(prefix, depth) {
  batch += `${prefix}\0`;
  categoryStrings += 1;
  if (batch.length >= 8192) {
    compare(batch, 'category-exhaustive');
    batch = '';
  }
  if (depth === 0) return;
  for (const character of categories) exhaustive(prefix + character, depth - 1);
}
exhaustive('', 4);
compare(batch, 'category-exhaustive-remainder', true);
compare('', 'empty', true);

const rich = [
  ...categories, '\u093c', '\u09cd', '\u0a4d', '\u0b4d', '\u0ccd', '\u0d4d', '\u0d15', '\u0903',
  '\u06dd', '\u{110bd}', '\u{1f3fb}', '\u{1f3ff}', '\u{1f1e7}', '\ufe0e', '\ufe0f',
  '\u{e0020}', '\u{e007f}', '\u{1f600}', '\u{1f9d1}', '\u{16d63}',
];
for (let sample = 0; sample < 64; sample += 1) {
  let text = '';
  const target = 8192 + random(8192);
  while (text.length < target) {
    text += random(4) === 0 ? String.fromCodePoint(random(0x110000)) : rich[random(rich.length)];
  }
  compare(text, `seeded-random-${sample}`, sample % 16 === 0);
}

const atoms = [
  '\r\n', '\u1100\u1100\u1161\u1161\u11a8', '\uac00\u11a8\u11a8',
  '\u{1f1e6}'.repeat(19), '\u0600\u0600a\u0300', '\u0915\u094d\u0915',
  '\u0915\u093c\u094d\u200d\u0915', '\u0d15\u0d4d\u0d15',
  '\u{1f469}\u0300\u200d\u{1f469}\u{1f3fd}', '\u{1f3f4}\u{e0067}\u{e0062}\u{e007f}',
  '\ud800\ud800\udc00\udc00', '\u0600\r\n\u0300',
];
for (let shift = -16; shift <= 16; shift += 1) {
  for (const atom of atoms) {
    const text = 'a'.repeat(4096 + shift) + atom.repeat(3) + 'z'.repeat(4097);
    compare(text, `adversarial-seam-${shift}`, shift === 0);
  }
}
for (const length of [4095, 4096, 4097, 8192, 65536]) {
  for (const cluster of [
    'a' + '\u0300'.repeat(length),
    '\u0600'.repeat(length) + 'a',
    '\u1100'.repeat(length) + '\u1161\u11a8',
    '\u{1f469}' + '\u0300'.repeat(length) + '\u200d\u{1f469}',
    '\u0915' + '\u093c'.repeat(length) + '\u094d\u0915',
  ]) {
    compare(cluster, 'giant-final-cluster', true);
    compare('ab' + cluster + 'yz', 'giant-middle-cluster', true);
  }
}
for (const text of [
  '\u{1f1e6}'.repeat(8193),
  ('\u{1f1e6}\u{1f1e7}\u0300').repeat(2048),
  '\r\n'.repeat(8192),
  '\u0915\u094d'.repeat(8192) + '\u0915z',
  '\u{1f469}\u200d'.repeat(8192) + '\u{1f469}z',
]) compare(text, 'long-adversarial', true);

// Reusing complete pages must preserve the same restart proof after edits,
// including an edit inside an old cluster or between a surrogate pair.
for (const atom of atoms) {
  const text = 'a'.repeat(4100) + atom + 'z'.repeat(4100);
  const previous = new SourceBoundaryIndex(text);
  const originalOffsets = previous.offsets();
  for (const position of [4095, 4100, 4101, 4100 + atom.length]) {
    for (const replacement of ['', '\u0300', '\u200d\u{1f469}', '\u{1f1e6}']) {
      const changed = text.slice(0, position) + replacement + text.slice(position + 1);
      const index = new SourceBoundaryIndex(changed, previous, position);
      assert.deepEqual(index.offsets(), nativeOffsets(changed), `edited ${position}`);
      assert.deepEqual(previous.offsets(), originalOffsets, 'previous pages remain immutable');
      comparisons += 1;
    }
  }
}

function observeNative(run) {
  const descriptor = Object.getOwnPropertyDescriptor(Intl.Segmenter.prototype, 'segment');
  const stats = { calls: 0, inputUnits: 0, maxInput: 0, traversedUnits: 0, segments: 0 };
  Object.defineProperty(Intl.Segmenter.prototype, 'segment', {
    configurable: true,
    value(text) {
      stats.calls += 1;
      stats.inputUnits += text.length;
      stats.maxInput = Math.max(stats.maxInput, text.length);
      const segments = nativeSegment.call(this, text);
      return {
        *[Symbol.iterator]() {
          for (const item of segments) {
            stats.traversedUnits += item.segment.length;
            stats.segments += 1;
            yield item;
          }
        },
      };
    },
  });
  try { return run(stats); }
  finally { Object.defineProperty(Intl.Segmenter.prototype, 'segment', descriptor); }
}

function trackedSource(text) {
  const stats = { slices: 0, units: 0, maxSlice: 0 };
  return {
    stats,
    source: {
      length: text.length,
      slice(start, end = text.length) {
        const result = text.slice(start, end);
        stats.slices += 1;
        stats.units += result.length;
        stats.maxSlice = Math.max(stats.maxSlice, result.length);
        return result;
      },
    },
  };
}

const ordinaryStats = observeNative(stats => {
  const text = 'a'.repeat(100_000);
  const tracked = trackedSource(text);
  const index = new SourceBoundaryIndex(tracked.source);
  assert.deepEqual(index.at(0), { startOffset: 0, endOffsetExclusive: 1 });
  assert.equal(stats.calls, 1, 'cold point lookup uses one native window');
  assert.equal(stats.maxInput, 4096, 'cold point lookup never materializes the long suffix');
  assert.equal(stats.traversedUnits, 1, 'cold point lookup traverses one grapheme');
  assert.ok(tracked.stats.units <= 4098, 'cold source materialization includes only a window and seam');

  const work = index.prepareThroughWork(text.length);
  let yields = 0;
  while (true) {
    const before = stats.segments;
    const step = work.next();
    assert.ok(stats.segments - before <= 257, 'ordinary preparation yields after bounded traversal');
    if (step.done) break;
    yields += 1;
  }
  assert.ok(yields >= 390, 'long preparation has cooperative checkpoints');
  assert.equal(index.offsets().length, text.length + 1);
  assert.equal(stats.calls, Math.ceil((text.length - 1) / 4095));
  assert.equal(stats.inputUnits, text.length + stats.calls - 1, 'only trailing clusters are read twice');
  assert.equal(stats.traversedUnits, stats.inputUnits);
  assert.equal(tracked.stats.units, stats.inputUnits + 2 * (stats.calls - 1), 'source slices include two-unit seam probes');
  const warmStats = { ...stats };
  assert.equal(Array.from(index.segments(text)).length, text.length);
  index.at(50_000);
  index.offsets();
  assert.deepEqual(stats, warmStats, 'completed index reuses native work for every access path');
  return { ...stats, sourceUnits: tracked.stats.units, yields };
});

const giantStats = observeNative(stats => {
  const text = 'a' + '\u0300'.repeat(65_536) + 'bc';
  const tracked = trackedSource(text);
  const index = new SourceBoundaryIndex(tracked.source);
  const work = index.prepareThroughWork(text.length);
  let yields = 0;
  while (!work.next().done) yields += 1;
  assert.deepEqual(index.offsets(), nativeOffsets(text));
  assert.ok(yields >= 5, 'geometric giant-cluster growth is resumable');
  assert.ok(stats.calls <= 7, 'giant input grows geometrically');
  assert.ok(stats.maxInput > 4096, 'the entire giant cluster must be seen');
  assert.ok(stats.inputUnits < text.length * 3, 'native materialization remains geometric');
  assert.ok(tracked.stats.units < text.length * 3, 'source slicing remains geometric');
  assert.equal(stats.traversedUnits, stats.inputUnits);
  const warmStats = { ...stats };
  index.at(32_768);
  Array.from(index.segments(text));
  assert.deepEqual(stats, warmStats, 'giant cluster boundaries are reused');
  return { ...stats, sourceUnits: tracked.stats.units, yields };
});

console.log(`terminal-ui grapheme windows passed: ${runtime}`);
console.log(JSON.stringify({ comparisons, categoryStrings, ordinaryStats, giantStats }));
