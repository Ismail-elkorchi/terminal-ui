import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sanitizeTerminalCellText,
  sanitizeTerminalControlText,
  sanitizeTerminalSingleLineText,
  sanitizeTerminalText,
  sanitizeTerminalTextWork,
} from '../../../dist/text/sanitize.js';
import { finishWork } from '../../../dist/foundation/cooperative-work.js';

// All generator functions inherit this iterator implementation. Count actual
// work steps rather than relying on runtime-specific elapsed-time thresholds.
const generatorPrototype = Object.getPrototypeOf(Object.getPrototypeOf((function* () {})()));

test('warm synchronous sanitizer hits return the admitted result without stepping work generators', () => {
  const text = 'Warm cache 界 e\u0301 👩‍💻 \u001b[31mred\u001b[0m\tvalue\r\nnext';
  const sanitizers = [sanitizeTerminalText, sanitizeTerminalSingleLineText, sanitizeTerminalCellText, sanitizeTerminalControlText];
  const expected = sanitizers.map(sanitize => sanitize(text));
  const next = generatorPrototype.next;
  let steps = 0;
  generatorPrototype.next = function (...args) { steps += 1; return Reflect.apply(next, this, args); };
  try {
    for (let repetition = 0; repetition < 20; repetition += 1) {
      for (let index = 0; index < sanitizers.length; index += 1) {
        assert.strictEqual(sanitizers[index](text), expected[index]);
      }
    }
  } finally {
    generatorPrototype.next = next;
  }
  assert.equal(steps, 0);
  assert.strictEqual(finishWork(sanitizeTerminalTextWork(text)), expected[0]);
});

test('cache admission still rejects unsafe replacements and separates width policy and text modes', () => {
  const text = 'cache-validation\t界\r\n\u0000tail';
  const baseline = sanitizeTerminalText(text);
  assert.throws(() => sanitizeTerminalText(text, { replacement: '\u001b[31m' }), /replacement must not contain/u);
  assert.throws(() => sanitizeTerminalText(text, { replacement: '\n' }), /replacement must not contain/u);
  assert.equal(sanitizeTerminalCellText(text).text.includes('\n'), false);
  assert.equal(sanitizeTerminalControlText(text).text.includes('\t'), true);
  assert.equal(sanitizeTerminalText(text, { replacement: '?' }).text.endsWith('?tail'), true);
  const narrow = sanitizeTerminalText('·\tZ', { widthProfile: { emoji: 'wide', ambiguous: 'narrow' } });
  const wide = sanitizeTerminalText('·\tZ', { widthProfile: { emoji: 'wide', ambiguous: 'wide' } });
  assert.equal(narrow.text, '·   Z');
  assert.equal(wide.text, '·  Z');
  assert.strictEqual(sanitizeTerminalText(text), baseline);
});
