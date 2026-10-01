import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeTerminalStyles } from '../../../dist/visual/terminal-style.js';
import { resolveRenderNodeStyle } from '../../../dist/renderer/style-resolution.js';
import { highlightRenderSpans } from '../../../dist/renderer/index.js';

function assertOwnedStyle(style, base, override) {
  assert.ok(style);
  assert.notEqual(style, base);
  assert.notEqual(style, override);
  assert.equal(Object.isFrozen(style), true);
  if (style.fg !== undefined) {
    assert.equal(Object.isFrozen(style.fg), true);
    assert.notEqual(style.fg, base?.fg);
    assert.notEqual(style.fg, override?.fg);
  }
}

test('terminal style composition is right biased, preserves false resets, and owns colors', () => {
  const base = { fg: { kind: 'rgb', r: 1, g: 2, b: 3 }, bold: true, dim: true };
  const override = { bold: false, dim: false, underline: false };
  const before = structuredClone([base, override]);
  const merged = mergeTerminalStyles(undefined, base, undefined, override);

  assert.deepEqual(merged, { ...base, ...override });
  assertOwnedStyle(merged, base, override);
  assert.deepEqual([base, override], before);
  base.fg.r = 99;
  override.bold = true;
  assert.equal(merged.fg.r, 1);
  assert.equal(merged.bold, false);
  assert.equal(mergeTerminalStyles(undefined, {}), undefined);
  assert.equal(mergeTerminalStyles(), undefined);
});

test('matched highlight styles use owned composition with right-biased false resets', () => {
  const base = { fg: { kind: 'rgb', r: 10, g: 20, b: 30 }, bold: true, underline: true };
  const override = { bold: false, underline: false };
  const before = structuredClone([base, override]);
  const [span] = highlightRenderSpans('match', 'match', { baseStyle: base, matchStyle: override });

  assert.equal(span?.matched, true);
  assert.deepEqual(span?.style, { ...base, ...override });
  assertOwnedStyle(span?.style, base, override);
  assert.deepEqual([base, override], before);
  base.fg.r = 99;
  override.bold = true;
  assert.equal(span.style.fg.r, 10);
  assert.equal(span.style.bold, false);
});

test('single-source matched highlight styles also own their style and color', () => {
  for (const option of ['baseStyle', 'matchStyle']) {
    const original = { fg: { kind: 'ansi', value: 4 }, italic: false };
    const [span] = highlightRenderSpans('match', 'match', { [option]: original });
    assert.deepEqual(span?.style, original);
    assertOwnedStyle(span?.style, original, undefined);
    original.fg.value = 1;
    assert.equal(span.style.fg.value, 4);
  }
});

test('render-node styles preserve base, root, part and ordered state precedence', () => {
  const renderNode = {
    kind: 'text',
    props: {},
    styles: {
      root: { fg: { kind: 'ansi', value: 1 }, bold: false },
      parts: { marker: { fg: { kind: 'ansi', value: 2 }, dim: false } },
      states: {
        focused: {
          root: { fg: { kind: 'ansi', value: 3 }, italic: true },
          parts: { marker: { fg: { kind: 'ansi', value: 4 }, bold: false } },
        },
        busy: {
          root: { fg: { kind: 'ansi', value: 5 }, underline: true },
          parts: { marker: { fg: { kind: 'ansi', value: 6 }, bold: false, italic: false } },
        },
      },
    },
  };
  const base = { fg: { kind: 'ansi', value: 0 }, dim: true, hidden: false };
  assert.deepEqual(resolveRenderNodeStyle(renderNode, {
    part: 'marker', base, states: ['focused', 'busy'],
  }), {
    fg: { kind: 'ansi', value: 6 }, dim: false, hidden: false,
    bold: false, italic: false, underline: true,
  });
  assert.deepEqual(resolveRenderNodeStyle(renderNode, {
    part: 'root', base, states: ['focused'],
  }), {
    fg: { kind: 'ansi', value: 3 }, dim: true, hidden: false, bold: true, italic: true,
  });
  assert.deepEqual(resolveRenderNodeStyle(renderNode, {
    part: 'root', base, states: ['focused'], applyDefaultStateStyle: false,
  }), {
    fg: { kind: 'ansi', value: 3 }, dim: true, hidden: false, bold: false, italic: true,
  });
});
