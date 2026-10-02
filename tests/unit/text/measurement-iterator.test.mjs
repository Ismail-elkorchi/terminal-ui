import assert from 'node:assert/strict';
import test from 'node:test';
import { defineTextWidthProfile, measuredGraphemes, segmentGraphemes, measureTextCells } from '../../../dist/text/index.js';

test('lazy measured graphemes preserve source boundaries and default measurements', () => {
  const source = 'a e\u0301 界 👩🏽‍💻';
  assert.deepEqual([...measuredGraphemes(source)], segmentGraphemes(source));
  const iterator = measuredGraphemes('a'.repeat(1_000_000));
  assert.deepEqual(iterator.next().value, { text: 'a', startOffset: 0, endOffsetExclusive: 1, cells: 1 });
  assert.equal(iterator.return().done, true);
});

test('codepoint emoji profile matches separately rendered scalars without changing grapheme editing boundaries', () => {
  const widthProfile = defineTextWidthProfile({ emoji: 'codepoint', ambiguous: 'narrow' });
  for (const [text, cells] of [['😀', 2], ['👩🏽', 4], ['👩🏽‍💻', 6], ['👨‍👩‍👧‍👦', 8], ['🇲🇦', 2], ['🏳️‍🌈', 3], ['❤️', 1], ['1️⃣', 1]]) {
    const segments = [...measuredGraphemes(text, { widthProfile })];
    assert.equal(segments.length, 1);
    assert.equal(segments[0].cells, cells, text);
    assert.equal(measureTextCells(text, { widthProfile }).cells, cells, text);
    assert.equal(segments[0].endOffsetExclusive, text.length);
  }
  assert.equal(measureTextCells('👩🏽‍💻').cells, 2);
  assert.equal(measureTextCells('e\u0301界', { widthProfile }).cells, 3);
});

test('sequence width governs frame continuation cells and following text', async () => {
  const { text } = await import('../../../dist/components/index.js');
  const { renderElementFrame } = await import('../../../dist/renderer/index.js');
  const widthProfile = defineTextWidthProfile({ emoji: 'codepoint', ambiguous: 'narrow' });
  const frame = renderElementFrame(text({ content: '👩🏽‍💻|' }), { columns: 10, rows: 1 }, { widthProfile });
  assert.equal(frame.cells[6].text, '|');
  assert.equal(frame.cells[0].width, 6);
  assert.equal(frame.cells[5].continuation, true);
});

test('source-preserving control sanitization leaves tab expansion to layout', async () => {
  const { sanitizeTerminalControlText } = await import('../../../dist/text/index.js');
  const source = 'a\t\u001b[31mb\n';
  const result = sanitizeTerminalControlText(source);
  assert.equal(result.text, 'a\tb\n');
  assert.equal(result.changed, true);
  assert.equal(sanitizeTerminalControlText('a\tb\n').changed, false);
});

test('lazy measurement owns one width policy throughout iteration', () => {
  const profile = { emoji: 'wide', ambiguous: 'narrow' };
  const options = { widthProfile: profile };
  const iterator = measuredGraphemes('👩🏽‍💻👩🏽‍💻', options);
  assert.equal(iterator.next().value.cells, 2);
  profile.emoji = 'codepoint';
  options.widthProfile = { emoji: 'narrow', ambiguous: 'wide' };
  assert.equal(iterator.next().value.cells, 2);
  assert.equal(iterator.next().done, true);
});
