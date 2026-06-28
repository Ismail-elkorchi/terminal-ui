import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { clipTextCells, measureTextCells, sanitizeTerminalText, segmentGraphemes, wrapTextCells } from '../../dist/text/index.js';
import {
  createScrollState,
  createTuiRuntime,
  defineTui,
  scrollReducer,
  visibleWindowFromScroll
} from '../../dist/tui/index.js';
import { inputField, stack } from '../../dist/widgets/index.js';
import { terminalFixtures } from '../fixtures/catalog.mjs';

const textFixtures = terminalFixtures
  .map((fixture) => fixture.data.text)
  .filter((value) => typeof value === 'string');

test('text property checks keep sanitization segmentation clipping and wrapping bounded', () => {
  for (const value of textFixtures) {
    const sanitized = sanitizeTerminalText(value);
    const metrics = measureTextCells(value);
    const clipped = clipTextCells(value, 6, { ellipsis: '…' });
    const wrapped = wrapTextCells(value.length === 0 ? 'x' : value, 8);

    assert.equal(metrics.text, sanitized.text, `metrics text drifted for ${JSON.stringify(value)}`);
    assert.equal(
      metrics.cells,
      metrics.graphemes.reduce((sum, segment) => sum + segment.cells, 0),
      `cell total mismatch for ${JSON.stringify(value)}`
    );
    assert.equal(
      segmentGraphemes(sanitized.text).map((segment) => segment.text).join(''),
      sanitized.text,
      `grapheme rejoin mismatch for ${JSON.stringify(value)}`
    );
    assert.ok(clipped.cells <= 6, `clipped output exceeded cell budget for ${JSON.stringify(value)}`);
    assert.ok(wrapped.every((line) => line.cells <= 8), `wrapped output exceeded cell budget for ${JSON.stringify(value)}`);
    assert.doesNotMatch(sanitized.text, /\u001B\[/u, `raw ANSI escaped sanitization for ${JSON.stringify(value)}`);
  }
});

test('scroll window properties keep normalized windows within content bounds', () => {
  for (let index = 0; index < 128; index += 1) {
    const contentRows = (index * 37) % 500;
    const viewportRows = index % 23;
    const state = createScrollState({
      offsetRow: (index * 19) - 50,
      offsetColumn: (index * 11) - 20,
      contentRows,
      contentColumns: (index * 13) % 200,
      viewportRows,
      viewportColumns: index % 17,
      followTail: index % 5 === 0
    });
    const scrolled = scrollReducer(state, { kind: 'scrollPages', rows: index % 7 - 3, columns: index % 5 - 2 });
    const window = visibleWindowFromScroll(scrolled);
    const detail = `index=${String(index)} contentRows=${String(contentRows)} viewportRows=${String(viewportRows)}`;

    assert.equal(window.start >= 0, true, `${detail}: start before zero`);
    assert.equal(window.end >= window.start, true, `${detail}: end before start`);
    assert.equal(window.end <= scrolled.contentRows, true, `${detail}: end beyond content`);
    assert.equal(window.end - window.start <= Math.max(0, scrolled.viewportRows), true, `${detail}: visible window exceeds viewport`);
  }
});

test('focus traversal properties avoid disabled targets and remain restorable', async () => {
  const app = defineTui({
    id: 'focus-properties',
    init: () => ({ active: 'initial' }),
    update: (state, message) => ({ state: { ...state, active: message.kind } }),
    view: (state) => stack([
      inputField({
        id: 'first',
        value: state.active,
        keyMap: { enter: { kind: 'first' } }
      }),
      inputField({
        id: 'disabled',
        value: state.active,
        focus: { disabled: true },
        keyMap: { enter: { kind: 'disabled' } }
      }),
      inputField({
        id: 'second',
        value: state.active,
        keyMap: { enter: { kind: 'second' } }
      })
    ], { id: 'focus-root' })
  });
  const host = createMemoryTerminalHost({ viewport: { columns: 24, rows: 5 } });
  const runtime = createTuiRuntime({ app, host });

  await runtime.start();
  const next = await runtime.handleInput({ kind: 'key', key: 'tab', ctrl: false, alt: false, shift: false, meta: false });
  const previous = await runtime.handleInput({ kind: 'key', key: 'tab', ctrl: false, alt: false, shift: true, meta: false });

  assert.deepEqual(next.frame.focusPath, ['focus-root', 'second']);
  assert.deepEqual(previous.frame.focusPath, ['focus-root', 'first']);
});
