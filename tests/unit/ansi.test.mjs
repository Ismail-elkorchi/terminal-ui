import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeRenderSpansStateful } from '../../dist/tui/index.js';

test('stateful ANSI serialization keeps adjacent same-style spans open once', () => {
  const output = serializeRenderSpansStateful([
    { text: 'A', style: { bold: true, fg: { kind: 'rgb', r: 1, g: 2, b: 3 } } },
    { text: 'B', style: { fg: { kind: 'rgb', r: 1, g: 2, b: 3 }, bold: true } }
  ], { capabilities: capabilities(24) });

  assert.equal(output, '\u001B[1;38;2;1;2;3mAB\u001B[0m');
});

test('stateful ANSI serialization resets only when style state changes or ends', () => {
  const output = serializeRenderSpansStateful([
    { text: 'A', style: { bold: true } },
    { text: 'B', style: { bold: true } },
    { text: 'C', style: { italic: true } },
    { text: 'D' }
  ], { capabilities: capabilities(8) });

  assert.equal(output, '\u001B[1mAB\u001B[22;3mC\u001B[23mD');
});

test('stateful ANSI serialization uses selective color and attribute transitions', () => {
  const output = serializeRenderSpansStateful([
    { text: 'A', style: { bold: true, dim: true, fg: { kind: 'ansi', value: 9 }, bg: { kind: 'ansi', value: 4 } } },
    { text: 'B', style: { underline: true, fg: { kind: 'ansi', value: 10 } } },
    { text: 'C' }
  ], { capabilities: capabilities(8) });

  assert.equal(output, '\u001B[1;2;38;5;9;48;5;4mA\u001B[22;4;38;5;10;49mB\u001B[24;39mC');
});

test('stateful ANSI serialization keeps hyperlink state open across adjacent matching spans', () => {
  const output = serializeRenderSpansStateful([
    { text: 'do', link: { href: 'https://example.test', id: 'doc' } },
    { text: 'c', link: { href: 'https://example.test', id: 'doc' } }
  ], { capabilities: capabilities(8, true), hyperlinks: true });

  assert.equal(output, '\u001B]8;id=doc;https://example.test\u0007doc\u001B]8;;\u0007');
});

test('stateful ANSI serialization omits SGR and OSC when capabilities disable them', () => {
  const output = serializeRenderSpansStateful([
    { text: 'plain', style: { bold: true, fg: { kind: 'rgb', r: 1, g: 2, b: 3 } }, link: { href: 'https://example.test' } }
  ], { capabilities: capabilities(0, false), hyperlinks: true });

  assert.equal(output, 'plain');
});

test('stateful ANSI serialization maps rgb colors through truecolor 256 color and 16 color capabilities', () => {
  const spans = [{ text: 'R', style: { fg: { kind: 'rgb', r: 255, g: 0, b: 0 } } }];

  assert.equal(serializeRenderSpansStateful(spans, { capabilities: capabilities(24) }), '\u001B[38;2;255;0;0mR\u001B[0m');
  assert.equal(serializeRenderSpansStateful(spans, { capabilities: capabilities(8) }), '\u001B[38;5;196mR\u001B[0m');
  assert.equal(serializeRenderSpansStateful(spans, { capabilities: capabilities(1) }), '\u001B[91mR\u001B[0m');
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
