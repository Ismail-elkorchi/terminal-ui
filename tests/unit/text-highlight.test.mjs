import assert from 'node:assert/strict';
import test from 'node:test';

import { findTextHighlightMatches } from '../../dist/text/index.js';
import { highlightRenderSpans } from '../../dist/renderer/index.js';

test('highlight matching uses grapheme ranges without splitting combining marks', () => {
  const spans = highlightRenderSpans('cafe\u0301 noir', 'é', {
    matchStyle: { underline: true }
  });

  assert.deepEqual(spans.map((span) => [span.text, span.matched === true]), [
    ['caf', false],
    ['é', true],
    [' noir', false]
  ]);
});

test('highlight matching keeps emoji ZWJ sequences whole', () => {
  const family = '👨‍👩‍👧‍👦';
  const spans = highlightRenderSpans(`team ${family} ok`, family, {
    matchStyle: { bold: true }
  });

  assert.deepEqual(spans.map((span) => [span.text, span.matched === true]), [
    ['team ', false],
    [family, true],
    [' ok', false]
  ]);
});

test('highlight matching supports CJK and case-insensitive text by default', () => {
  assert.deepEqual(findTextHighlightMatches('Alpha界Beta界', '界'), [
    { startGraphemeIndex: 5, endGraphemeIndexExclusive: 6 },
    { startGraphemeIndex: 10, endGraphemeIndexExclusive: 11 }
  ]);
  assert.deepEqual(highlightRenderSpans('Alpha', 'alp').map((span) => [span.text, span.matched === true]), [
    ['Alp', true],
    ['ha', false]
  ]);
});

test('highlight matching can fold accents when requested', () => {
  assert.deepEqual(findTextHighlightMatches('Résumé', 'resume', { accentSensitive: false }), [
    { startGraphemeIndex: 0, endGraphemeIndexExclusive: 6 }
  ]);
});

test('highlight render spans preserve base style and overlay match style', () => {
  const spans = highlightRenderSpans('Status ok', 'ok', {
    baseStyle: { fg: { kind: 'ansi', value: 8 } },
    matchStyle: { underline: true }
  });

  assert.deepEqual(spans.at(-1), {
    text: 'ok',
    style: { fg: { kind: 'ansi', value: 8 }, underline: true },
    matched: true
  });
});
