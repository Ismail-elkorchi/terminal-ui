import assert from 'node:assert/strict';

export function measureGraphicsProbe(pixels, width, height, bounds) {
  assert.ok(Buffer.isBuffer(pixels), 'Graphics probe pixels must be a Buffer.');
  assert.ok(Number.isSafeInteger(width) && width > 0, 'Graphics probe width must be a positive integer.');
  assert.ok(Number.isSafeInteger(height) && height > 0, 'Graphics probe height must be a positive integer.');
  assert.equal(pixels.byteLength, width * height * 3, 'Graphics probe pixels must contain packed RGB8 data.');
  const region = measurementRegion(width, height, bounds);
  const { red, green } = largestProbeRegions(pixels, width, height, region);
  const probe = unionRegions(red, green);
  return { red, green, probe };
}

export function countPixelsInBounds(pixels, width, height, bounds, matches) {
  assert.ok(Buffer.isBuffer(pixels), 'Screenshot pixels must be a Buffer.');
  assert.equal(pixels.byteLength, width * height * 3, 'Screenshot pixels must contain packed RGB8 data.');
  const region = measurementRegion(width, height, bounds);
  let count = 0;
  for (let y = region.minY; y <= region.maxY; y += 1) {
    for (let x = region.minX; x <= region.maxX; x += 1) {
      const offset = (y * width + x) * 3;
      if (matches(pixels[offset], pixels[offset + 1], pixels[offset + 2])) count += 1;
    }
  }
  return count;
}

export function graphicsProbeResidueRatio(visible, hidden) {
  assert.ok(visible.red.count > 0 && visible.green.count > 0, 'Visible graphics evidence must contain both probe regions.');
  return Math.max(
    hidden.red.count / visible.red.count,
    hidden.green.count / visible.green.count,
  );
}

export function isGraphicsProbeCleared(visible, hidden) {
  return graphicsProbeResidueRatio(visible, hidden) <= 0.005;
}

function measurementRegion(width, height, bounds) {
  if (bounds === undefined) {
    return { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 };
  }
  assert.ok(bounds.count > 0, 'Graphics probe bounds must contain pixels.');
  for (const [name, value] of Object.entries({
    minX: bounds.minX,
    minY: bounds.minY,
    maxX: bounds.maxX,
    maxY: bounds.maxY,
  })) {
    assert.ok(Number.isSafeInteger(value), `Graphics probe ${name} must be an integer.`);
  }
  assert.ok(bounds.minX >= 0 && bounds.minY >= 0, 'Graphics probe bounds must begin inside the screenshot.');
  assert.ok(bounds.maxX >= bounds.minX && bounds.maxY >= bounds.minY, 'Graphics probe bounds must be ordered.');
  assert.ok(bounds.maxX < width && bounds.maxY < height, 'Graphics probe bounds must end inside the screenshot.');
  return bounds;
}

function largestProbeRegions(pixels, width, height, region) {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let red = { count: 0 };
  let green = { count: 0 };
  for (let y = region.minY; y <= region.maxY; y += 1) {
    for (let x = region.minX; x <= region.maxX; x += 1) {
      const pixel = y * width + x;
      if (visited[pixel] === 1) continue;
      const color = probeColor(pixels, pixel);
      if (color === 0) continue;
      const candidate = measureConnectedRegion(pixels, width, region, visited, queue, pixel, color);
      if (color === 1 && candidate.count > red.count) red = candidate;
      if (color === 2 && candidate.count > green.count) green = candidate;
    }
  }
  return { red, green };
}

function measureConnectedRegion(pixels, width, bounds, visited, queue, start, color) {
  let head = 0;
  let tail = 1;
  let count = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;
  queue[0] = start;
  visited[start] = 1;
  while (head < tail) {
    const pixel = queue[head];
    head += 1;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    count += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    for (const adjacent of adjacentPixels(x, y, width, bounds)) {
      if (visited[adjacent] === 1 || probeColor(pixels, adjacent) !== color) continue;
      visited[adjacent] = 1;
      queue[tail] = adjacent;
      tail += 1;
    }
  }
  return { count, minX, minY, maxX, maxY };
}

function adjacentPixels(x, y, width, bounds) {
  return [
    ...(x > bounds.minX ? [y * width + x - 1] : []),
    ...(x < bounds.maxX ? [y * width + x + 1] : []),
    ...(y > bounds.minY ? [(y - 1) * width + x] : []),
    ...(y < bounds.maxY ? [(y + 1) * width + x] : []),
  ];
}

function probeColor(pixels, pixel) {
  const offset = pixel * 3;
  const red = pixels[offset];
  const green = pixels[offset + 1];
  const blue = pixels[offset + 2];
  if (blue >= 80 || Math.max(red, green) <= 40) return 0;
  if (red > green + 10) return 1;
  if (green > red + 10) return 2;
  return 0;
}

function unionRegions(first, second) {
  if (first.count === 0) return second;
  if (second.count === 0) return first;
  return {
    count: first.count + second.count,
    minX: Math.min(first.minX, second.minX),
    minY: Math.min(first.minY, second.minY),
    maxX: Math.max(first.maxX, second.maxX),
    maxY: Math.max(first.maxY, second.maxY),
  };
}
