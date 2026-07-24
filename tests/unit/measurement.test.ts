import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clampMeasurement,
  combineMeasurementsHorizontally,
  combineMeasurementsOverlay,
  combineMeasurementsVertically,
  measurement,
  measureBlock,
  measureLine,
  measureSize,
  measureSpans,
  measureText,
  normalizeMeasurement,
  zeroMeasurement
} from '../../dist/renderer/index.js';

void test('measurement helpers normalize clamp and combine element measurements', () => {
  assert.deepEqual(zeroMeasurement(), { minWidth: 0, minHeight: 0, preferredWidth: 0, preferredHeight: 0 });
  assert.deepEqual(normalizeMeasurement({
    minWidth: -5,
    minHeight: 1.8,
    preferredWidth: 1,
    preferredHeight: 99,
    maxWidth: 4,
    maxHeight: 3
  }), {
    minWidth: 0,
    minHeight: 1,
    preferredWidth: 1,
    preferredHeight: 3,
    maxWidth: 4,
    maxHeight: 3
  });
  assert.deepEqual(measurement({ minWidth: 4, minHeight: 2, preferredWidth: 1, preferredHeight: 1 }), {
    minWidth: 4,
    minHeight: 2,
    preferredWidth: 4,
    preferredHeight: 2
  });
  assert.deepEqual(normalizeMeasurement({
    minWidth: 10,
    minHeight: 5,
    preferredWidth: 20,
    preferredHeight: 1,
    maxWidth: 5,
    maxHeight: 3
  }), {
    minWidth: 10,
    minHeight: 5,
    preferredWidth: 10,
    preferredHeight: 5,
    maxWidth: 10,
    maxHeight: 5
  });
  assert.deepEqual(clampMeasurement(measureSize(10, 5, 2, 1), { width: 6, height: 3 }), {
    minWidth: 2,
    minHeight: 1,
    preferredWidth: 6,
    preferredHeight: 3,
    maxWidth: 6,
    maxHeight: 3
  });

  const narrow = measureSize(2, 1, 1, 1);
  const wide = measureSize(10, 3, 4, 2);
  assert.deepEqual(combineMeasurementsVertically([narrow, wide], 1), {
    minWidth: 4,
    minHeight: 4,
    preferredWidth: 10,
    preferredHeight: 5
  });
  assert.deepEqual(combineMeasurementsHorizontally([narrow, wide], 2), {
    minWidth: 7,
    minHeight: 2,
    preferredWidth: 14,
    preferredHeight: 3
  });
  assert.deepEqual(combineMeasurementsOverlay([narrow, wide]), {
    minWidth: 4,
    minHeight: 2,
    preferredWidth: 10,
    preferredHeight: 3
  });
});

void test('measurement helpers measure text spans lines and blocks by terminal cell width', () => {
  assert.deepEqual(measureText(''), { minWidth: 0, minHeight: 0, preferredWidth: 0, preferredHeight: 1 });
  assert.deepEqual(measureText('a界\n🙂'), { minWidth: 0, minHeight: 0, preferredWidth: 3, preferredHeight: 2 });
  assert.deepEqual(measureSpans([{ text: 'a' }, { text: '界' }, { text: 'e\u0301' }]), {
    minWidth: 0,
    minHeight: 0,
    preferredWidth: 4,
    preferredHeight: 1
  });
  assert.deepEqual(measureLine({ spans: [{ text: '🙂x' }] }), {
    minWidth: 0,
    minHeight: 0,
    preferredWidth: 3,
    preferredHeight: 1
  });
  assert.deepEqual(measureBlock({ lines: [{ spans: [{ text: 'ab' }] }, { spans: [{ text: '界🙂' }] }] }), {
    minWidth: 0,
    minHeight: 0,
    preferredWidth: 4,
    preferredHeight: 2
  });
});
