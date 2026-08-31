import assert from 'node:assert/strict';
import test from 'node:test';

import {
  graphicsProbeResidueRatio,
  isGraphicsProbeCleared,
  measureGraphicsProbe,
} from '../../scripts/graphics-probe-pixels.mjs';

test('graphics probe geometry is the union of the known red and green regions', () => {
  const pixels = screenshot(8, 5, [
    { x: 2, y: 2, width: 2, height: 2, color: [255, 0, 0] },
    { x: 4, y: 2, width: 3, height: 2, color: [0, 255, 0] },
    // Colored subpixel antialiasing that matched the former broad saturation heuristic.
    { x: 0, y: 0, width: 2, height: 1, color: [180, 150, 0] },
  ]);

  const measured = measureGraphicsProbe(pixels, 8, 5);

  assert.deepEqual(measured.red, { count: 4, minX: 2, minY: 2, maxX: 3, maxY: 3 });
  assert.deepEqual(measured.green, { count: 6, minX: 4, minY: 2, maxX: 6, maxY: 3 });
  assert.deepEqual(measured.probe, { count: 10, minX: 2, minY: 2, maxX: 6, maxY: 3 });
});

test('graphics probe cleanup examines only the previously occupied rectangle', () => {
  const visible = measureGraphicsProbe(screenshot(8, 5, [
    { x: 2, y: 2, width: 2, height: 2, color: [255, 0, 0] },
    { x: 4, y: 2, width: 3, height: 2, color: [0, 255, 0] },
  ]), 8, 5);
  const hidden = screenshot(8, 5, [
    { x: 0, y: 0, width: 1, height: 1, color: [255, 0, 0] },
  ]);

  assert.deepEqual(measureGraphicsProbe(hidden, 8, 5, visible.probe), {
    red: { count: 0 },
    green: { count: 0 },
    probe: { count: 0 },
  });
});

test('graphics cleanup distinguishes tiny text antialiasing from a retained probe half', () => {
  const visible = measureGraphicsProbe(screenshot(200, 100, [
    { x: 0, y: 0, width: 100, height: 100, color: [255, 0, 0] },
    { x: 100, y: 0, width: 100, height: 100, color: [0, 255, 0] },
  ]), 200, 100);
  const textAntialiasing = measureGraphicsProbe(screenshot(200, 100, [
    { x: 20, y: 20, width: 1, height: 12, color: [180, 150, 0] },
  ]), 200, 100, visible.probe);
  const retainedHalf = measureGraphicsProbe(screenshot(200, 100, [
    { x: 0, y: 0, width: 100, height: 100, color: [255, 0, 0] },
  ]), 200, 100, visible.probe);

  assert.ok(graphicsProbeResidueRatio(visible, textAntialiasing) < 0.005);
  assert.equal(graphicsProbeResidueRatio(visible, retainedHalf), 1);
  assert.equal(isGraphicsProbeCleared(visible, textAntialiasing), true);
  assert.equal(isGraphicsProbeCleared(visible, retainedHalf), false);
});

function screenshot(width, height, regions) {
  const pixels = Buffer.alloc(width * height * 3);
  for (const region of regions) {
    for (let y = region.y; y < region.y + region.height; y += 1) {
      for (let x = region.x; x < region.x + region.width; x += 1) {
        const offset = (y * width + x) * 3;
        pixels.set(region.color, offset);
      }
    }
  }
  return pixels;
}
