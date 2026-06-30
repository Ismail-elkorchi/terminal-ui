import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defineBreakpoints,
  responsive,
  viewportVariant
} from '../../dist/widgets/index.js';

test('responsive selects explicit viewport variants deterministically', () => {
  const breakpoints = defineBreakpoints({
    narrow: { maxColumns: 79 },
    medium: { minColumns: 80, maxColumns: 119 },
    wide: { minColumns: 120 }
  });

  assert.equal(viewportVariant({ columns: 72, rows: 24 }, breakpoints), 'narrow');
  assert.equal(viewportVariant({ columns: 100, rows: 30 }, breakpoints), 'medium');
  assert.equal(responsive({ columns: 150, rows: 42 }, breakpoints, {
    narrow: () => 'narrow-view',
    medium: () => 'medium-view',
    wide: () => 'wide-view'
  }), 'wide-view');
});

test('responsive rejects breakpoint overlap and uncovered viewports unless default exists', () => {
  assert.throws(() => defineBreakpoints({
    one: { minColumns: 40, maxColumns: 90 },
    two: { minColumns: 80, maxColumns: 120 }
  }), /overlap/u);

  const breakpoints = defineBreakpoints({
    narrow: { maxColumns: 60 },
    wide: { minColumns: 100 }
  });

  assert.throws(() => viewportVariant({ columns: 80, rows: 24 }, breakpoints), /No responsive breakpoint/u);
  assert.equal(responsive({ columns: 80, rows: 24 }, breakpoints, {
    narrow: () => 'narrow-view',
    wide: () => 'wide-view',
    default: () => 'default-view'
  }), 'default-view');
});

test('responsive rejects missing runtime variant functions clearly', () => {
  const breakpoints = defineBreakpoints({
    narrow: { maxColumns: 80 }
  });

  assert.throws(() => responsive({ columns: 40, rows: 10 }, breakpoints, {}), /missing/u);
});
