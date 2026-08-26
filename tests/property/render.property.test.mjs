import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogHistory } from '../../dist/behavior/index.js';

import { resolveTerminalCapabilities } from '../../dist/host/index.js';
import {
  diffFrames,
  renderDiffAnsi,
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import { applyRenderDiff } from '../../dist/renderer/internal/diff-interpreter.js';
import {
  richText,
  logViewer,
  text
} from '../../dist/components/index.js';
import { defaultTextWidthProfile } from '../../dist/text/index.js';
import { textSamples } from '../support/text-samples.mjs';

const colorCapabilities = resolveTerminalCapabilities({
  host: {
    runtime: 'memory',
    inputIsTty: true,
    outputIsTty: true,
    supportsRawInput: true
  },
  environment: {
    variables: {
      COLORTERM: 'truecolor',
      TERM: 'xterm-256color'
    }
  }
});

test('render diff property checks keep unchanged frames empty and local changes incremental', () => {
  for (const value of textSamples) {
    const before = renderElementFrame(text({ content: value }), { columns: 20, rows: 3 });
    const same = diffFrames(before, before);
    const after = renderElementFrame(text({ content: `${value} changed` }), { columns: 20, rows: 3 });
    const changed = diffFrames(before, after);
    const detail = `value=${JSON.stringify(value)}`;

    assert.equal(renderFramePlain(before).includes('\u001B'), false, `${detail}: plain frame leaked ANSI`);
    assert.equal(same.fullRewrite, false, `${detail}: unchanged frame requested rewrite`);
    assert.equal(same.operations.length, 0, `${detail}: unchanged frame emitted operations`);
    assert.equal(changed.fullRewrite, false, `${detail}: local text change requested rewrite`);
    assert.ok(changed.operations.length > 0, `${detail}: local text change emitted no operations`);
  }
});

test('diff round-trips reproduce the next frame text and keep ANSI serialization safe', () => {
  for (const { index, seed, value } of generatedTexts(32)) {
    const before = renderElementFrame(text({ content: value }), { columns: 18, rows: 4 });
    const next = renderElementFrame(text({ content: `unsafe ${index} ${value} \u001B[31mred` }), { columns: 18, rows: 4 });
    const diff = diffFrames(before, next);
    const applied = applyRenderDiff(before, diff);
    const serialized = renderDiffAnsi(diff, { capabilities: colorCapabilities });
    const detail = `index=${String(index)} seed=${String(seed)} value=${JSON.stringify(value)}`;

    assert.equal(renderFramePlain(applied), renderFramePlain(next), `${detail}: diff round-trip changed visible text`);
    assert.equal(serialized.includes('unsafe'), true, `${detail}: diff serialization dropped visible text`);
    assert.equal(serialized.includes('\u001B[31munsafe'), false, `${detail}: diff serialization leaked raw user ANSI`);
  }
});

test('style-only diffs are incremental and preserve visual dimensions', () => {
  const previous = renderElementFrame(richText({
    id: 'status',
    segments: [{ kind: 'text', text: 'same text', style: { fg: { kind: 'theme', token: 'status.info' } } }]
  }), { columns: 24, rows: 2 });
  const next = renderElementFrame(richText({
    id: 'status',
    segments: [{ kind: 'text', text: 'same text', style: { fg: { kind: 'theme', token: 'status.error' } } }]
  }), { columns: 24, rows: 2 });
  const diff = diffFrames(previous, next);

  assert.equal(diff.fullRewrite, false);
  assert.ok(diff.operations.length > 0);
  assert.ok(diff.operations.length <= 2);
  assert.equal(diff.width, previous.width);
  assert.equal(diff.height, previous.height);
});

test('log viewer cached retained data produces the same frames as fresh data across render environments', () => {
  const items = Array.from({ length: 96 }, (_value, index) => Object.freeze({
    id: `item-${String(index)}`,
    text: `${index % 3 === 0 ? 'needle ' : ''}row ${String(index)} wide 界 emoji 🙂 combining e\u0301 ${'body '.repeat(index % 7)}`,
    timestamp: `12:${String(index % 60).padStart(2, '0')}`,
    metadata: { source: `worker-${String(index % 5)}` }
  }));
  const profiles = [
    defaultTextWidthProfile,
    { emoji: 'narrow', ambiguous: 'wide' }
  ];
  const cases = [
    { columns: 18, rows: 7, wrap: true, searchQuery: '' },
    { columns: 31, rows: 9, wrap: true, searchQuery: 'needle' },
    { columns: 52, rows: 11, wrap: false, searchQuery: 'worker-3' },
    { columns: 23, rows: 8, wrap: true, searchQuery: '界' }
  ];

  for (const widthProfile of profiles) {
    for (const current of cases) {
      const history = createLogHistory(items);
      const options = {
        id: 'history',
        history,
        wrap: current.wrap,
        query: { text: current.searchQuery, mode: 'contains' }
      };
      renderElementFrame(logViewer(options), current, { widthProfile });
      const cached = renderElementFrame(logViewer(options), current, { widthProfile });
      const freshItems = items.map((item) => ({ ...item, metadata: { ...item.metadata } }));
      const fresh = renderElementFrame(logViewer({ ...options, history: createLogHistory(freshItems) }), current, { widthProfile });
      const detail = `columns=${String(current.columns)} rows=${String(current.rows)} wrap=${String(current.wrap)} query=${current.searchQuery}`;

      assert.deepEqual(cached, fresh, detail);
    }
  }
});

function generatedTexts(count) {
  const seeds = [...textSamples, '', 'plain', 'wide界text', 'emoji🙂text', 'combining e\u0301', '\u001B[31mred'];
  const output = [];
  let state = 0x12345678;
  while (output.length < count) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const base = seeds[state % seeds.length] ?? '';
    output.push({ index: output.length, seed: state, value: `${base}${String(state % 997)}` });
  }
  return output;
}
