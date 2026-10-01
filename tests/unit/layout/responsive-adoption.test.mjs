import assert from 'node:assert/strict';
import test from 'node:test';
import { defineBreakpoints, viewportVariant, responsive } from '../../../dist/layout/index.js';

test('breakpoint admission owns nested ranges and freezes the checked map', () => {
  const input = { small: { maxColumns: 79 }, large: { minColumns: 80 } };
  const breakpoints = defineBreakpoints(input);
  input.small.maxColumns = 100;
  assert.equal(viewportVariant({ columns: 85, rows: 5 }, breakpoints), 'large');
  assert.equal(Object.isFrozen(breakpoints), true);
  assert.equal(Object.isFrozen(breakpoints.small), true);
});

test('breakpoint boundaries are non-negative safe integer cell counts on both entry paths', () => {
  for (const value of [79.9, Number.NaN, Number.POSITIVE_INFINITY, -1, Number.MAX_SAFE_INTEGER + 1]) {
    const ranges = { only: { minColumns: value, maxRows: 40 } };
    assert.throws(() => defineBreakpoints(ranges), /safe integer/u);
    assert.throws(() => viewportVariant({ columns: 80, rows: 10 }, ranges), /safe integer/u);
    assert.throws(() => responsive({ columns: 80, rows: 10 }, ranges, { only: () => 'value', default: () => 'fallback' }), /safe integer/u);
  }
});

test('breakpoint selection validates viewport cells and rejects malformed direct maps', () => {
  const valid = defineBreakpoints({ all: { minColumns: 0 } });
  for (const viewport of [{ columns: 0.5, rows: 1 }, { columns: 1, rows: Number.NaN }, { columns: -1, rows: 1 }]) {
    assert.throws(() => viewportVariant(viewport, valid), /safe integer/u);
  }
  for (const invalid of [{}, { default: { minColumns: 0 } }, { empty: {} }, { one: { minColumns: 5, maxColumns: 1 } }]) {
    assert.throws(() => viewportVariant({ columns: 10, rows: 10 }, invalid));
  }
});
