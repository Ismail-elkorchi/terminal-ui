import assert from 'node:assert/strict';
import test from 'node:test';

import { image, text } from '../../dist/components/index.js';
import { createGraphicsBudget, rasterImage } from '../../dist/graphics/index.js';
import { overlay, row } from '../../dist/layout/index.js';
import {
  encodeKittyDirectPlacement,
  encodeKittyImageUpload,
  encodeKittyUnicodePlaceholder,
  encodeKittyVirtualPlacement,
  encodeSixelImage,
  resolveGraphicGeometry,
} from '../../dist/protocol/index.js';
import { createFrameBuffer, diffFrames, renderElementFrame, renderFramePlain } from '../../dist/renderer/index.js';
import {
  createCellPixelGeometryResponseProtocol,
  createKittyGraphicsResponseProtocol,
  createPrimaryDeviceAttributesResponseProtocol,
  createKittyPassthroughResponseProtocol,
  kittyPassthroughQueryRequest,
} from '../../dist/host/graphics-query.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { createTranscriptRecorder, validateTranscript } from '../../dist/transcript/index.js';
import { createTerminalGraphicsCommitter } from '../../dist/tui/graphics-committer.js';
import { defaultTheme, defineTheme } from '../../dist/theme/index.js';

const encoder = new TextEncoder();

test('raster images own their exact RGB and RGBA byte sources', () => {
  const source = new Uint8Array([255, 0, 0, 0, 255, 0]);
  const resource = rasterImage({ width: 2, height: 1, format: 'rgb8', data: source });
  const digest = resource.contentDigest;
  source.fill(0);

  assert.equal(resource.byteLength, 6);
  assert.equal(resource.contentDigest, digest);
  assert.match(digest, /^raster:sha256:[0-9a-f]{64}$/u);
  assert.equal(Object.isFrozen(resource), true);
  assert.throws(
    () => rasterImage({ width: 2, height: 1, format: 'rgba8', data: new Uint8Array(6) }),
    /exactly 8 bytes/u,
  );
});

test('graphics budgets guard source, geometry, encoding, placement, and live-resource allocations', () => {
  assert.throws(
    () => rasterImage({
      width: 2,
      height: 2,
      format: 'rgb8',
      data: new Uint8Array(12),
    }, { sourcePixels: 3 }),
    /sourcePixels limit of 3/u,
  );
  assert.throws(
    () => rasterImage({
      width: 2,
      height: 2,
      format: 'rgb8',
      data: new Uint8Array(12),
    }, { sourceBytes: 11 }),
    /sourceBytes limit of 11/u,
  );

  assert.throws(
    () => createGraphicsBudget({ cellPixelWidth: 8 }).admitCellPixels({ width: 9, height: 1 }),
    /cellPixelWidth limit of 8/u,
  );
  assert.throws(
    () => createGraphicsBudget({ fittedPixels: 8 }).admitFittedPixels(3, 3),
    /fittedPixels limit of 8/u,
  );
  assert.throws(
    () => createGraphicsBudget({ placementsPerFrame: 1 }).addPlacement(2),
    /placementsPerFrame limit of 1/u,
  );
  assert.throws(
    () => createGraphicsBudget({ liveResources: 1 }).admitLiveResources(2),
    /liveResources limit of 1/u,
  );
  assert.throws(
    () => createGraphicsBudget({ encodedBytesPerUpload: 8 }).assertUploadBytes(9),
    /encodedBytesPerUpload limit of 8/u,
  );
  const commit = createGraphicsBudget({ encodedBytesPerCommit: 8 });
  commit.addCommitBytes(4);
  assert.throws(() => commit.addCommitBytes(5), /encodedBytesPerCommit limit of 8/u);
});

test('image components publish one clipped graphic and retain a plain fallback', () => {
  const resource = rasterImage({
    width: 2,
    height: 1,
    format: 'rgba8',
    data: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128]),
  });
  const frame = renderElementFrame(image({
    id: 'logo',
    image: resource,
    label: 'Logo',
    measurement: { minWidth: 1, minHeight: 1, preferredWidth: 4, preferredHeight: 2 },
  }), { columns: 4, rows: 2 });

  assert.equal(renderFramePlain(frame), 'Logo');
  assert.equal(frame.graphics.length, 1);
  assert.deepEqual(frame.graphics[0]?.bounds, { row: 1, column: 1, width: 4, height: 2 });
  assert.deepEqual(frame.graphics[0]?.clip, frame.graphics[0]?.bounds);
  assert.equal(frame.accessibility.root.role, 'image');
  assert.equal(frame.accessibility.root.label, 'Logo');

  const diff = diffFrames(undefined, frame);
  assert.equal(diff.graphicOperations.length, 1);
  assert.equal(diff.graphicOperations[0]?.kind, 'place');
});

test('later cell writes clip an existing graphic instead of being covered by it', () => {
  const resource = rasterImage({ width: 4, height: 1, format: 'rgb8', data: new Uint8Array(12) });
  const buffer = createFrameBuffer(4, 1);
  buffer.placeGraphic({
    id: 'preview',
    image: resource,
    fit: 'fill',
    bounds: { row: 1, column: 1, width: 4, height: 1 },
  });
  buffer.write(1, 2, [{ text: 'X' }]);

  const frame = buffer.snapshot();
  assert.equal(frame.graphics.length, 2);
  assert.deepEqual(frame.graphics.map((placement) => placement.clip), [
    { row: 1, column: 1, width: 1, height: 1 },
    { row: 1, column: 3, width: 2, height: 1 },
  ]);
  assert.equal(renderFramePlain(frame), ' X');
});

test('sparse preserve layers occlude graphics only where they render', () => {
  const resource = rasterImage({ width: 4, height: 2, format: 'rgb8', data: new Uint8Array(24) });
  const frame = renderElementFrame(overlay([
    image({
      id: 'background-image',
      image: resource,
      decorative: true,
      fit: 'fill',
      measurement: { minWidth: 1, minHeight: 1, preferredWidth: 4, preferredHeight: 2 },
    }),
    text({
      id: 'overlay-text',
      content: 'X',
      meta: { layer: { zIndex: 1, underlay: 'preserve' } },
    }),
  ]), { columns: 4, rows: 2 });

  assert.equal(renderFramePlain(frame), 'X');
  assert.deepEqual(frame.graphics.map((placement) => placement.clip), [
    { row: 2, column: 1, width: 4, height: 1 },
    { row: 1, column: 2, width: 3, height: 1 },
  ]);
});

test('graphic geometry keeps contain aspect and crops clipped destinations', () => {
  const resource = rasterImage({ width: 100, height: 50, format: 'rgb8', data: new Uint8Array(15_000) });
  const geometry = resolveGraphicGeometry({
    id: 'preview',
    image: resource,
    fit: 'contain',
    bounds: { row: 1, column: 1, width: 20, height: 10 },
    clip: { row: 3, column: 4, width: 10, height: 5 },
  }, { width: 8, height: 16 });

  assert.deepEqual(geometry?.destination, { row: 3, column: 4, width: 10, height: 5 });
  assert.ok((geometry?.source.width ?? 0) < resource.width);
});

test('Kitty transport chunks uploads and distinguishes direct from tmux-owned placement', () => {
  const resource = rasterImage({ width: 50, height: 30, format: 'rgb8', data: new Uint8Array(4_500) });
  const upload = encodeKittyImageUpload(resource, 7, 'direct');
  assert.match(upload, /i=7/u);
  assert.match(upload, /m=1/u);
  assert.match(upload, /q=2/u);
  assert.match(upload, /\u001b_Gm=0;/u);
  assert.ok(upload.split('\u001b\\').length >= 3);

  const geometry = {
    destination: { row: 2, column: 3, width: 4, height: 5 },
    source: { x: 0, y: 0, width: 50, height: 30 },
  };
  const direct = encodeKittyDirectPlacement(7, 9, geometry);
  assert.doesNotMatch(direct, /tmux;/u);
  assert.match(direct, /p=9/u);
  assert.match(direct, /C=1/u);

  const virtual = encodeKittyVirtualPlacement(7, 9, geometry, 'tmux-passthrough');
  assert.match(virtual, /tmux;/u);
  assert.match(virtual, /U=1/u);
  const placeholder = encodeKittyUnicodePlaceholder(7, 9, geometry);
  assert.match(placeholder, /\u{10eeee}/u);
  assert.match(placeholder, /\u0305/u);
  assert.match(placeholder, /\u030d/u);
  assert.ok(encoder.encode(placeholder).byteLength > placeholder.length);
  assert.throws(
    () => encodeKittyUnicodePlaceholder(
      7,
      9,
      geometry,
      createGraphicsBudget({ encodedBytesPerCommit: placeholder.length }),
    ),
    /encodedBytesPerCommit/u,
  );
});

test('SIXEL encoding scales pixels, defines a palette, and terminates its DCS', () => {
  const resource = rasterImage({
    width: 2,
    height: 2,
    format: 'rgba8',
    data: new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 0,
    ]),
  });
  const encoded = encodeSixelImage(resource, {
    destination: { row: 1, column: 1, width: 2, height: 1 },
    source: { x: 0, y: 0, width: 2, height: 2 },
  }, { width: 2, height: 4 }, { r: 0, g: 0, b: 0 });
  assert.match(encoded, /\u001bP0;0q"1;1;4;4/u);
  assert.match(encoded, /#0;2;/u);
  assert.match(encoded, /#1;2;/u);
  assert.doesNotMatch(encoded, /#(?:[4-9]|[1-9][0-9]+);2;/u);
  assert.ok(encoded.endsWith('\u001b\\'));
});

test('SIXEL preserves binary transparency and requires RGB composition for partial alpha', () => {
  const transparent = rasterImage({
    width: 2,
    height: 1,
    format: 'rgba8',
    data: new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0]),
  });
  const geometry = {
    destination: { row: 1, column: 1, width: 2, height: 1 },
    source: { x: 0, y: 0, width: 2, height: 1 },
  };
  const encoded = encodeSixelImage(transparent, geometry, { width: 1, height: 1 }, undefined);
  assert.match(encoded, /\u001bP0;1q/u);

  const translucent = rasterImage({
    width: 1,
    height: 1,
    format: 'rgba8',
    data: new Uint8Array([255, 0, 0, 128]),
  });
  assert.throws(
    () => encodeSixelImage(translucent, {
      destination: { row: 1, column: 1, width: 1, height: 1 },
      source: { x: 0, y: 0, width: 1, height: 1 },
    }, { width: 1, height: 1 }, undefined),
    /explicit RGB app\.background/u,
  );
});

test('SIXEL planning ignores unrelated damage and reuses retained encodings for intersecting damage', async () => {
  const resource = rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([255, 0, 0]) });
  const host = createMemoryTerminalHost({
    capabilities: {
      graphics: {
        kitty: 'unsupported',
        sixel: 'supported',
        cellPixels: { width: 1, height: 1 },
      },
    },
  });
  const capabilities = await host.getCapabilities();
  const committer = createTerminalGraphicsCommitter('sixel');
  const render = (label, status) => renderElementFrame(row([
    image({
      id: 'cached-image',
      image: resource,
      label,
      fit: 'fill',
      measurement: { minWidth: 1, minHeight: 1, preferredWidth: 2, preferredHeight: 1 },
    }),
    text({ id: 'status', content: status }),
  ], { sizes: [{ kind: 'fixed', cells: 2 }, { kind: 'fixed', cells: 2 }] }), {
    columns: 4,
    rows: 2,
  });

  const initial = render('A', 'ok');
  const initialPlan = committer.plan(initial, diffFrames(undefined, initial), capabilities, defaultTheme);
  assert.match(initialPlan.afterCells, /\u001bP0;/u);
  assert.deepEqual(committer.metrics(), { sixelEncodes: 1, sixelCacheHits: 0 });

  const unrelated = render('A', 'go');
  const unrelatedPlan = committer.plan(unrelated, diffFrames(initial, unrelated), capabilities, defaultTheme);
  assert.equal(unrelatedPlan.afterCells, '');
  assert.deepEqual(committer.metrics(), { sixelEncodes: 1, sixelCacheHits: 0 });

  const intersecting = render('B', 'go');
  const intersectingPlan = committer.plan(
    intersecting,
    diffFrames(unrelated, intersecting),
    capabilities,
    defaultTheme,
  );
  assert.match(intersectingPlan.afterCells, /\u001bP0;/u);
  assert.deepEqual(committer.metrics(), { sixelEncodes: 1, sixelCacheHits: 1 });
  await host.dispose();
});

test('SIXEL removal and overlap changes clear stale pixels and repaint in frame order', async () => {
  const lower = rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([255, 0, 0]) });
  const changedLower = rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([0, 255, 0]) });
  const upper = rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([0, 0, 255]) });
  const host = createMemoryTerminalHost({
    capabilities: {
      graphics: {
        kitty: 'unsupported',
        sixel: 'supported',
        cellPixels: { width: 1, height: 1 },
      },
    },
  });
  const capabilities = await host.getCapabilities();
  const committer = createTerminalGraphicsCommitter('sixel');
  const base = renderElementFrame(text({ content: 'x' }), { columns: 1, rows: 2 });
  const placement = (id, resource) => ({
    id,
    image: resource,
    fit: 'fill',
    bounds: { row: 1, column: 1, width: 1, height: 1 },
    clip: { row: 1, column: 1, width: 1, height: 1 },
  });
  const initial = Object.freeze({ ...base, graphics: [placement('lower', lower), placement('upper', upper)] });
  committer.plan(initial, diffFrames(undefined, initial), capabilities, defaultTheme);

  const changed = Object.freeze({
    ...base,
    graphics: [placement('lower', changedLower), placement('upper', upper)],
  });
  const changedPlan = committer.plan(changed, diffFrames(initial, changed), capabilities, defaultTheme);
  assert.equal(changedPlan.forceFullRewrite, true);
  assert.equal(changedPlan.afterCells.match(/\u001bP0;/gu)?.length, 2);

  const removed = Object.freeze({ ...base, graphics: [placement('lower', changedLower)] });
  const removedPlan = committer.plan(removed, diffFrames(changed, removed), capabilities, defaultTheme);
  assert.equal(removedPlan.forceFullRewrite, true);
  assert.match(removedPlan.beforeCells, /\u001b\[2J/u);
  assert.equal(removedPlan.afterCells.match(/\u001bP0;/gu)?.length, 1);
  await host.dispose();
});

test('SIXEL keeps the terminal last row as a text scroll guard', async () => {
  const resource = rasterImage({
    width: 1,
    height: 1,
    format: 'rgb8',
    data: new Uint8Array([255, 0, 0]),
  });
  const host = createMemoryTerminalHost({
    terminalSize: { columns: 1, rows: 2 },
    capabilities: {
      graphics: {
        kitty: 'unsupported',
        sixel: 'supported',
        cellPixels: { width: 1, height: 6 },
      },
    },
  });
  const frame = renderElementFrame(image({
    image: resource,
    label: 'Image',
    fallback: 'x',
    fit: 'fill',
    measurement: { minWidth: 1, minHeight: 2, preferredWidth: 1, preferredHeight: 2 },
  }), { columns: 1, rows: 2 });
  const committer = createTerminalGraphicsCommitter('sixel');

  const plan = committer.plan(
    frame,
    diffFrames(undefined, frame),
    await host.getCapabilities(),
    defaultTheme,
  );

  assert.match(plan.afterCells, /"1;1;1;6/u);
  assert.doesNotMatch(plan.afterCells, /"1;1;1;12/u);
  assert.equal(renderFramePlain(frame), 'x');
  await host.dispose();
});

test('SIXEL invalidates retained images when the scroll guard moves', async () => {
  const resource = rasterImage({
    width: 1,
    height: 1,
    format: 'rgb8',
    data: new Uint8Array([255, 0, 0]),
  });
  const host = createMemoryTerminalHost({
    capabilities: {
      graphics: {
        kitty: 'unsupported',
        sixel: 'supported',
        cellPixels: { width: 1, height: 1 },
      },
    },
  });
  const base = renderElementFrame(text({ content: 'x' }), { columns: 1, rows: 2 });
  const placement = {
    id: 'bottom-adjacent',
    image: resource,
    fit: 'fill',
    bounds: { row: 1, column: 1, width: 1, height: 1 },
    clip: { row: 1, column: 1, width: 1, height: 1 },
  };
  const initial = Object.freeze({ ...base, graphics: [placement] });
  const committer = createTerminalGraphicsCommitter('sixel');
  const capabilities = await host.getCapabilities();
  committer.plan(initial, diffFrames(undefined, initial), capabilities, defaultTheme);

  const oneRowBase = renderElementFrame(text({ content: 'x' }), { columns: 1, rows: 1 });
  const oneRow = Object.freeze({ ...oneRowBase, graphics: [placement] });
  const plan = committer.plan(oneRow, diffFrames(undefined, oneRow), capabilities, defaultTheme);

  assert.equal(plan.forceFullRewrite, true);
  assert.match(plan.beforeCells, /\u001b\[2J/u);
  assert.equal(plan.afterCells, '');
  await host.dispose();
});

test('SIXEL crop, resize, and composition-background changes invalidate retained encodings', async () => {
  const resource = rasterImage({ width: 2, height: 1, format: 'rgb8', data: new Uint8Array(6) });
  const host = createMemoryTerminalHost({
    capabilities: {
      graphics: {
        kitty: 'unsupported',
        sixel: 'supported',
        cellPixels: { width: 1, height: 1 },
      },
    },
  });
  const capabilities = await host.getCapabilities();
  const committer = createTerminalGraphicsCommitter('sixel');
  const base = renderElementFrame(text({ content: 'xx' }), { columns: 2, rows: 2 });
  const frame = (width) => Object.freeze({
    ...base,
    graphics: [{
      id: 'cropped',
      image: resource,
      fit: 'cover',
      bounds: { row: 1, column: 1, width, height: 1 },
      clip: { row: 1, column: 1, width, height: 1 },
    }],
  });

  const cropped = frame(1);
  committer.plan(cropped, diffFrames(undefined, cropped), capabilities, defaultTheme);
  const resized = frame(2);
  committer.plan(resized, diffFrames(cropped, resized), capabilities, defaultTheme);
  const background = defineTheme({
    tokens: { colors: { 'app.background': { kind: 'rgb', r: 1, g: 2, b: 3 } } },
  });
  committer.plan(resized, diffFrames(resized, resized), capabilities, background);

  assert.deepEqual(committer.metrics(), { sixelEncodes: 3, sixelCacheHits: 0 });
  await host.dispose();
});

test('graphics probing derives independent Kitty, SIXEL, and cell-pixel evidence', () => {
  assert.deepEqual(createKittyGraphicsResponseProtocol().classify(encoder.encode('\u001b_Gi=31;OK\u001b\\')), {
    kind: 'matched',
    value: 'supported',
  });
  assert.deepEqual(createCellPixelGeometryResponseProtocol().classify(encoder.encode('\u001b[6;18;9t')), {
    kind: 'matched',
    value: { width: 9, height: 18 },
  });
  assert.deepEqual(createPrimaryDeviceAttributesResponseProtocol().classify(encoder.encode('\u001b[?1;2;4c')), {
    kind: 'matched',
    value: 'supported',
  });
});

test('graphics probing accepts Kitty primary attributes with a trailing parameter separator', () => {
  assert.deepEqual(createPrimaryDeviceAttributesResponseProtocol().classify(encoder.encode('\u001b[?62;52;c')), {
    kind: 'matched',
    value: 'unsupported',
  });
});

test('tmux Kitty probing completes on its unique response and passes through no generic terminal queries', () => {
  const request = kittyPassthroughQueryRequest();
  assert.match(request, /tmux;/u);
  assert.match(request, /a=q/u);
  assert.doesNotMatch(request, /\[16t|\[c/u);

  const protocol = createKittyPassthroughResponseProtocol();
  assert.equal(protocol.classify(encoder.encode('\u001b[?1;2c')), undefined);
  assert.deepEqual(protocol.classify(encoder.encode('\u001b_Gi=31;OK\u001b\\')), {
    kind: 'matched',
    value: { kitty: 'supported', kittyTransport: 'tmux-passthrough' },
  });
});

test('the host merges direct tmux geometry with Kitty passthrough evidence without leaking responses', async () => {
  const host = createMemoryTerminalHost({
    env: { TMUX: '/tmp/tmux,1,0' },
  });
  host.input('before\u001b[6;18;9t\u001b[?1;2c\u001b_Gi=31;OK\u001b\\after');

  const capabilities = await host.getCapabilities({ activeProbes: ['graphics'] });
  const input = host.stdin.read()[Symbol.asyncIterator]();
  const retainedInput = await readInputText(input, 'beforeafter'.length);
  await input.return?.();

  assert.equal(capabilities.graphics.kitty.support, 'supported');
  assert.equal(capabilities.graphics.kitty.transport, 'tmux-passthrough');
  assert.equal(capabilities.graphics.sixel.support, 'unsupported');
  assert.deepEqual(capabilities.graphics.cellPixels, { width: 9, height: 18 });
  assert.equal(retainedInput, 'beforeafter');
  const output = host.output();
  assert.match(output, /tmux;/u);
  const passthrough = output.slice(output.indexOf('\u001bPtmux;'));
  assert.doesNotMatch(passthrough, /\[16t|\[c/u);
});

test('the host graphics probe consumes verified responses and retains unrelated input', async () => {
  const host = createMemoryTerminalHost();
  host.input('before\u001b_Gi=31;OK\u001b\\\u001b[6;18;9t\u001b[?1;2;4cafter');

  const capabilities = await host.getCapabilities({ activeProbes: ['graphics'] });
  const input = host.stdin.read()[Symbol.asyncIterator]();
  const retainedInput = await readInputText(input, 'beforeafter'.length);
  await input.return?.();

  assert.equal(capabilities.graphics.kitty.support, 'supported');
  assert.equal(capabilities.graphics.kitty.transport, 'direct');
  assert.equal(capabilities.graphics.sixel.support, 'supported');
  assert.deepEqual(capabilities.graphics.cellPixels, { width: 9, height: 18 });
  assert.equal(retainedInput, 'beforeafter');
  assert.match(host.output(), /a=q/u);
  assert.match(host.output(), /\u001b\[16t/u);
  assert.match(host.output(), /\u001b\[c/u);
});

test('Kitty planning clears cell damage beneath retained placements', async () => {
  const resource = rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([255, 0, 0]) });
  const host = createMemoryTerminalHost({
    capabilities: {
      graphics: {
        kitty: 'supported',
        sixel: 'unsupported',
        kittyTransport: 'direct',
        cellPixels: { width: 1, height: 1 },
      },
    },
  });
  const capabilities = await host.getCapabilities();
  const committer = createTerminalGraphicsCommitter('kitty');
  const render = (fallback, status) => renderElementFrame(row([
    image({
      id: 'retained-image',
      image: resource,
      label: 'Image',
      fallback,
      fit: 'fill',
      measurement: { minWidth: 2, minHeight: 1, preferredWidth: 2, preferredHeight: 1 },
    }),
    text({ id: 'status', content: status }),
  ], { sizes: [{ kind: 'fixed', cells: 2 }, { kind: 'fixed', cells: 2 }] }), {
    columns: 4,
    rows: 1,
  });

  const initial = render('aa', 'ok');
  committer.plan(initial, diffFrames(undefined, initial), capabilities, defaultTheme);

  const unrelated = render('aa', 'go');
  const unrelatedPlan = committer.plan(unrelated, diffFrames(initial, unrelated), capabilities, defaultTheme);
  assert.equal(unrelatedPlan.afterCells, '');

  const intersecting = render('bb', 'go');
  const intersectingPlan = committer.plan(
    intersecting,
    diffFrames(unrelated, intersecting),
    capabilities,
    defaultTheme,
  );
  assert.match(intersectingPlan.afterCells, /\u001b\[1;1H  /u);
  assert.doesNotMatch(intersectingPlan.afterCells, /_Ga=p,/u);

  const rewritePlan = committer.plan(
    intersecting,
    diffFrames(undefined, intersecting),
    capabilities,
    defaultTheme,
  );
  assert.match(rewritePlan.afterCells, /\u001b\[1;1H  /u);
  assert.doesNotMatch(rewritePlan.afterCells, /_Ga=p,/u);
  await host.dispose();
});

test('tmux Kitty planning uses virtual placements and repaints Unicode placeholders after cell damage', async () => {
  const resource = rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([255, 0, 0]) });
  const host = createMemoryTerminalHost({
    capabilities: {
      graphics: {
        kitty: 'supported',
        sixel: 'unsupported',
        kittyTransport: 'tmux-passthrough',
        cellPixels: { width: 3, height: 4 },
      },
    },
  });
  const capabilities = await host.getCapabilities();
  const committer = createTerminalGraphicsCommitter('kitty');
  const render = (fallback) => renderElementFrame(image({
    id: 'tmux-image',
    image: resource,
    label: 'Image',
    fallback,
    fit: 'fill',
    measurement: { minWidth: 2, minHeight: 1, preferredWidth: 2, preferredHeight: 1 },
  }), { columns: 2, rows: 1 });

  const initial = render('aa');
  const initialPlan = committer.plan(initial, diffFrames(undefined, initial), capabilities, defaultTheme);
  assert.match(initialPlan.afterCells, /tmux;/u);
  assert.match(initialPlan.afterCells, /s=6,v=4/u);
  assert.match(initialPlan.afterCells, /U=1/u);
  assert.match(initialPlan.afterCells, /\u{10eeee}/u);
  assert.doesNotMatch(initialPlan.afterCells, /C=1/u);

  const damaged = render('bb');
  const damagedPlan = committer.plan(damaged, diffFrames(initial, damaged), capabilities, defaultTheme);
  assert.doesNotMatch(damagedPlan.afterCells, /U=1/u);
  assert.match(damagedPlan.afterCells, /\u{10eeee}/u);
  await host.dispose();
});

test('tmux Kitty placeholders tile geometry beyond the protocol coordinate table', async () => {
  const resource = rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([255, 0, 0]) });
  const host = createMemoryTerminalHost({
    terminalSize: { columns: 298, rows: 1 },
    capabilities: {
      graphics: {
        kitty: 'supported',
        sixel: 'unsupported',
        kittyTransport: 'tmux-passthrough',
        cellPixels: { width: 1, height: 1 },
      },
    },
  });
  const capabilities = await host.getCapabilities();
  const committer = createTerminalGraphicsCommitter('kitty');
  const frame = renderElementFrame(image({
    image: resource,
    label: 'Wide image',
    fit: 'fill',
    measurement: { minWidth: 298, minHeight: 1, preferredWidth: 298, preferredHeight: 1 },
  }), { columns: 298, rows: 1 });

  const plan = committer.plan(frame, diffFrames(undefined, frame), capabilities, defaultTheme);
  assert.equal(plan.afterCells.match(/U=1/gu)?.length, 2);
  assert.equal(plan.afterCells.match(/\u{10eeee}/gu)?.length, 298);
  await host.dispose();
});

test('runtime commits upload and clean up Kitty resources around the cell frame', async () => {
  const resource = rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([1, 2, 3]) });
  const host = createMemoryTerminalHost({
    capabilities: {
      graphics: { kitty: 'supported', sixel: 'unsupported', kittyTransport: 'direct' },
    },
  });
  const app = defineTui({
    id: 'kitty-commit',
    init: () => ({ state: undefined }),
    update: (state) => ({ state }),
    view: () => image({
      image: resource,
      label: 'Pixel',
      fit: 'fill',
      measurement: { minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 },
    }),
  });
  const runtime = createTuiRuntime({ app, host, graphics: 'kitty' });

  await runtime.start();
  assert.match(host.output(), /_Ga=t,/u);
  assert.match(host.output(), /_Ga=p,/u);
  const firstImageId = /_Ga=t,[^;]*i=([0-9]+)/u.exec(host.output())?.[1];
  assert.notEqual(firstImageId, undefined);
  await runtime.suspendOutput();
  assert.match(host.output(), new RegExp(`_Ga=d,d=i,i=${firstImageId},p=[0-9]+,q=2`, 'u'));
  runtime.resumeOutput();
  await runtime.redraw();
  assert.equal(host.output().match(/_Ga=t,/gu)?.length, 2);
  await runtime.dispose();
  assert.equal(host.output().match(/_Ga=d,d=I,i=[0-9]+,q=2/gu)?.length, 2);
});

test('Kitty resources are shared by exact raster content and deleted after their final placement', async () => {
  const first = rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([1, 2, 3]) });
  const reconstructed = rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([1, 2, 3]) });
  const host = createMemoryTerminalHost({
    terminalSize: { columns: 4, rows: 1 },
    capabilities: {
      graphics: { kitty: 'supported', sixel: 'unsupported', kittyTransport: 'direct' },
    },
  });
  const app = defineTui({
    id: 'content-addressed-kitty',
    init: () => ({ state: 2 }),
    update: (_state, count) => ({ state: count }),
    view: (count) => row([
      ...(count >= 1 ? [image({
        id: 'first',
        image: first,
        label: 'A',
        fit: 'fill',
        measurement: { minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 },
      })] : []),
      ...(count >= 2 ? [image({
        id: 'second',
        image: reconstructed,
        label: 'B',
        fit: 'fill',
        measurement: { minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 },
      })] : []),
    ]),
  });
  const runtime = createTuiRuntime({ app, host, graphics: 'kitty' });

  await runtime.start();
  assert.equal(host.output().match(/_Ga=t,/gu)?.length, 1);
  assert.equal(host.output().match(/_Ga=p,/gu)?.length, 2);
  await runtime.dispatch(1);
  assert.equal(host.output().match(/_Ga=t,/gu)?.length, 1);
  assert.equal(host.output().match(/_Ga=d,d=I,/gu)?.length ?? 0, 0);
  await runtime.dispatch(0);
  assert.equal(host.output().match(/_Ga=d,d=I,/gu)?.length, 1);
  await runtime.dispose();
  assert.equal(host.output().match(/_Ga=d,d=I,/gu)?.length, 1);
});

test('Kitty content identity includes raster shape and survives application reconstruction', async () => {
  const horizontal = rasterImage({ width: 2, height: 1, format: 'rgb8', data: new Uint8Array(6) });
  const vertical = rasterImage({ width: 1, height: 2, format: 'rgb8', data: new Uint8Array(6) });
  const host = createMemoryTerminalHost({
    terminalSize: { columns: 4, rows: 1 },
    capabilities: {
      graphics: { kitty: 'supported', sixel: 'unsupported', kittyTransport: 'direct' },
    },
  });
  const app = defineTui({
    id: 'shaped-kitty-resources',
    init: () => ({ state: 0 }),
    update: (_state, next) => ({ state: next }),
    view: (revision) => row([
      image({
        id: 'rebuilt',
        image: rasterImage({ width: 2, height: 1, format: 'rgb8', data: new Uint8Array(6) }),
        label: `H${String(revision)}`,
        fit: 'fill',
        measurement: { minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 },
      }),
      image({
        id: 'different-shape',
        image: revision === 0 ? vertical : horizontal,
        label: 'V',
        fit: 'fill',
        measurement: { minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 },
      }),
    ]),
  });
  const runtime = createTuiRuntime({ app, host, graphics: 'kitty' });

  await runtime.start();
  assert.equal(host.output().match(/_Ga=t,/gu)?.length, 2);
  await runtime.dispatch(1);
  assert.equal(host.output().match(/_Ga=t,/gu)?.length, 2);
  assert.equal(host.output().match(/_Ga=d,d=I,/gu)?.length, 1);
  await runtime.dispose();
});

test('runtime replaces graphics when terminal cell geometry changes', async () => {
  const resource = rasterImage({ width: 2, height: 1, format: 'rgb8', data: new Uint8Array(6) });
  const host = createMemoryTerminalHost({
    capabilities: {
      graphics: {
        kitty: 'supported',
        sixel: 'unsupported',
        kittyTransport: 'direct',
        cellPixels: { width: 8, height: 16 },
      },
    },
  });
  const replacementHost = createMemoryTerminalHost({
    capabilities: {
      graphics: {
        kitty: 'supported',
        sixel: 'unsupported',
        kittyTransport: 'direct',
        cellPixels: { width: 10, height: 20 },
      },
    },
  });
  const app = defineTui({
    id: 'geometry-replacement',
    init: () => ({ state: undefined }),
    update: (state) => ({ state }),
    view: () => image({
      image: resource,
      label: 'Preview',
      measurement: { minWidth: 2, minHeight: 1, preferredWidth: 2, preferredHeight: 1 },
    }),
  });
  const runtime = createTuiRuntime({ app, host, graphics: 'kitty' });

  await runtime.start();
  runtime.replaceTerminalProfile({ capabilities: await replacementHost.getCapabilities() });
  await runtime.redraw();

  assert.equal(host.output().match(/_Ga=t,/gu)?.length, 2);
  assert.equal(host.output().match(/_Ga=d,d=I,/gu)?.length, 1);
  await runtime.dispose();
  await replacementHost.dispose();
});

test('runtime graphics budget failures retain text fallback without partial protocol resources', async () => {
  const resource = rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([1, 2, 3]) });
  const host = createMemoryTerminalHost({
    capabilities: {
      graphics: { kitty: 'supported', sixel: 'unsupported', kittyTransport: 'direct' },
    },
  });
  const app = defineTui({
    id: 'graphics-budget-fallback',
    init: () => ({ state: undefined }),
    update: (state) => ({ state }),
    view: () => image({
      image: resource,
      label: 'Fallback pixel',
      fit: 'fill',
      measurement: { minWidth: 1, minHeight: 1, preferredWidth: 14, preferredHeight: 1 },
    }),
  });
  const runtime = createTuiRuntime({
    app,
    host,
    graphics: 'kitty',
    graphicsBudget: { encodedBytesPerUpload: 1 },
  });

  const frame = await runtime.start();
  assert.equal(frame.graphics.length, 1);
  assert.match(renderFramePlain(frame), /Fallback pixel/u);
  assert.doesNotMatch(host.output(), /_Ga=t,/u);
  assert.equal(
    runtime.diagnostics().filter((item) => item.diagnostic.code === 'TUI_GRAPHICS_LIMIT_EXCEEDED').length,
    1,
  );
  await runtime.redraw();
  assert.equal(
    runtime.diagnostics().filter((item) => item.diagnostic.code === 'TUI_GRAPHICS_LIMIT_EXCEEDED').length,
    1,
  );
  await runtime.dispose();
  assert.doesNotMatch(host.output(), /_Ga=d,/u);
});

test('malicious terminal cell geometry is rejected before SIXEL allocation', async () => {
  const resource = rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([1, 2, 3]) });
  const host = createMemoryTerminalHost({
    capabilities: {
      graphics: {
        kitty: 'unsupported',
        sixel: 'supported',
        cellPixels: { width: 1_000_000, height: 1_000_000 },
      },
    },
  });
  const app = defineTui({
    id: 'malicious-cell-geometry',
    init: () => ({ state: undefined }),
    update: (state) => ({ state }),
    view: () => image({
      image: resource,
      label: 'Safe fallback',
      fit: 'fill',
      measurement: { minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 },
    }),
  });
  const runtime = createTuiRuntime({ app, host, graphics: 'sixel' });

  await runtime.start();
  assert.doesNotMatch(host.output(), /\u001bP0;/u);
  assert.equal(
    runtime.diagnostics().some((item) => item.diagnostic.code === 'TUI_GRAPHICS_LIMIT_EXCEEDED'),
    true,
  );
  await runtime.dispose();
});

test('transcripts retain graphic metadata without raster bytes', () => {
  const resource = rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([1, 2, 3]) });
  const frame = renderElementFrame(image({
    image: resource,
    label: 'Pixel',
    measurement: { minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 },
  }), { columns: 1, rows: 1 });
  const recorder = createTranscriptRecorder({ id: 'graphics', source: 'test' });
  recorder.record({ kind: 'commit', commit: {
    id: 'graphics:commit:1',
    stateVersion: 0,
    terminalSize: { columns: 1, rows: 1 },
    frame,
    diff: diffFrames(undefined, frame),
  } });
  const transcript = recorder.snapshot();
  const json = JSON.stringify(transcript);
  assert.doesNotMatch(json, /"data"/u);
  assert.match(json, /contentDigest/u);
  assert.equal(validateTranscript(JSON.parse(json)).status, 'success');
});

function inputText(value) {
  if (value === undefined) return '';
  return typeof value === 'string' ? value : new TextDecoder().decode(value);
}

async function readInputText(iterator, expectedLength) {
  let text = '';
  while (text.length < expectedLength) {
    const result = await iterator.next();
    if (result.done) break;
    text += inputText(result.value?.data);
  }
  return text;
}
