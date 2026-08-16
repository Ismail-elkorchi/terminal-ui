import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveTerminalCapabilities } from '../../dist/host/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import { highContrastTheme } from '../../dist/theme/index.js';
import { renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import { progressBar } from '../../dist/components/index.js';

test('progressBar component supports value plus percentage display and status tone', () => {
  const frame = renderElementFrame(progressBar({
    id: 'deploy',
    label: 'Deploy',
    mode: { kind: 'determinate', value: 5, max: 10 },
    barWidth: 4,
    display: 'bar+value+percent',
    status: 'success'
  }), { columns: 32, rows: 1 });
  const filledCell = frame.cells.find((cell) => cell.text === '█');
  const markerCell = frame.cells.find((cell) => cell.source?.description === 'status.marker');
  const valueCell = frame.cells.find((cell) => cell.source?.description === 'value' && cell.text === '5');
  const percentageCell = frame.cells.find((cell) => cell.source?.description === 'percentage' && cell.text === '5');

  assert.equal(renderFramePlain(frame), '✓ Deploy ██░░ 5/10 50%');
  assert.equal(markerCell?.text, '✓');
  assert.equal(markerCell?.source?.cellRole, 'decoration');
  assert.deepEqual(filledCell?.style?.fg, { kind: 'theme', token: 'status.success' });
  assert.equal(filledCell?.style?.bold, true);
  assert.equal(filledCell?.source?.description, 'filled');
  assert.equal(filledCell?.source?.cellRole, 'decoration');
  assert.equal(valueCell?.text, '5');
  assert.equal(percentageCell?.text, '5');
  assert.deepEqual(frame.accessibility.root.numericValue, { current: 5, minimum: 0, maximum: 10 });
});

test('progressBar supports bar-only display with end label and explicit bar width', () => {
  const frame = renderElementFrame(progressBar({
    id: 'compact',
    label: 'Build',
    mode: { kind: 'determinate', value: 1, max: 4 },
    barWidth: 4,
    display: 'bar',
    labelPosition: 'end'
  }), { columns: 32, rows: 1 });
  const filled = frame.cells.find((cell) => cell.source?.description === 'filled');
  const empty = frame.cells.find((cell) => cell.source?.description === 'track');

  assert.equal(renderFramePlain(frame), '█░░░ Build');
  assert.equal(filled?.style?.fg?.token, 'control.track.filled');
  assert.equal(filled?.style?.bold, true);
  assert.equal(empty?.style?.fg?.token, 'control.track');
  assert.equal(empty?.style?.dim, true);
});

test('progressBar treats bar width as terminal cells under ambiguous-wide profiles', () => {
  const widthProfile = { emoji: 'wide', ambiguous: 'wide' };
  const frame = renderElementFrame(progressBar({
    id: 'wide-progress',
    label: 'Progress',
    labelPosition: 'none',
    mode: { kind: 'determinate', value: 1, max: 1 },
    barWidth: 4,
    display: 'bar'
  }), { columns: 6, rows: 1 }, { widthProfile });

  assert.equal(renderFramePlain(frame), '██');
  assert.equal(frame.cells.filter((cell) =>
    cell.source?.elementId === 'wide-progress'
    && cell.continuation !== true
  ).length, 2);
});

test('progressBar valueScale renders segmented fill tokens', () => {
  const frame = renderElementFrame(progressBar({
    id: 'scaled-progress',
    label: 'Progress',
    mode: { kind: 'determinate', value: 8, max: 10 },
    barWidth: 5,
    display: 'bar',
    labelPosition: 'none',
    valueScale: [
      { at: 0, token: 'scale.low' },
      { at: 0.5, token: 'scale.high' },
      { at: 0.75, token: 'scale.critical' }
    ]
  }), { columns: 12, rows: 1 });

  const segments = frame.cells.filter((cell) => cell.source?.description?.startsWith('segment.') === true);

  assert.equal(renderFramePlain(frame), '████░');
  assert.equal(segments.length, 4);
  assert.equal(segments[0]?.style?.fg?.token, 'scale.low');
  assert.equal(segments[2]?.style?.fg?.token, 'scale.high');
  assert.equal(segments[3]?.style?.fg?.token, 'scale.critical');
});

test('progressBar renders explicit elapsed and remaining timing without hidden clocks', () => {
  const frame = renderElementFrame(progressBar({
    id: 'timed',
    label: 'Upload',
    mode: { kind: 'determinate', value: 2, max: 4 },
    barWidth: 4,
    display: 'bar+value+percent',
    elapsedMs: 65_000,
    remainingMs: 125_000
  }), { columns: 64, rows: 1 });

  assert.equal(renderFramePlain(frame), 'Upload ██░░ 2/4 50% 1m05s elapsed 2m05s left');
  assert.equal(frame.accessibility.root.description, '1m05s elapsed 2m05s left');
});

test('progressBar rejects invalid caller-supplied display and geometry values', () => {
  const base = {
    id: 'invalid-progress',
    label: 'Sync',
    mode: { kind: 'determinate', value: 1, max: 2 }
  };
  const componentRangeError = (error) => error.name === 'ComponentExecutionError'
    && error.cause instanceof RangeError;
  const componentTypeError = (error) => error.name === 'ComponentExecutionError'
    && error.cause instanceof TypeError;
  assert.throws(() => progressBar({ ...base, elapsedMs: -1 }), componentRangeError);
  assert.throws(() => progressBar({ ...base, remainingMs: Number.NaN }), componentRangeError);
  assert.throws(() => progressBar({ ...base, barWidth: 0 }), componentRangeError);
  assert.throws(() => progressBar({ ...base, display: 'value' }), componentTypeError);
  assert.throws(() => progressBar({ ...base, labelPosition: 'middle' }), componentTypeError);
});

test('progressBar supports label-free percentage and tiny viewport clipping', () => {
  const frame = renderElementFrame(progressBar({
    id: 'tiny',
    label: 'Hidden',
    labelPosition: 'none',
    mode: { kind: 'determinate', value: 3, max: 4 },
    barWidth: 4,
    display: 'bar+percent'
  }), { columns: 6, rows: 1 });

  assert.equal(renderFramePlain(frame), '██ 75%');
  assert.deepEqual(frame.accessibility.root.numericValue, { current: 3, minimum: 0, maximum: 4 });
});

test('progressBar degrades display parts deterministically under width pressure', () => {
  const normal = renderElementFrame(progressBar({
    id: 'normal-pressure',
    label: 'Sync',
    mode: { kind: 'determinate', value: 3, max: 4 },
    display: 'bar+value+percent',
    elapsedMs: 65_000,
    barWidth: 10,
    status: 'success'
  }), { columns: 20, rows: 1 });
  const tight = renderElementFrame(progressBar({
    id: 'tight-pressure',
    label: 'Sync',
    mode: { kind: 'determinate', value: 3, max: 4 },
    display: 'bar+value+percent',
    elapsedMs: 65_000,
    barWidth: 10,
    status: 'success'
  }), { columns: 9, rows: 1 });
  const tiny = renderElementFrame(progressBar({
    id: 'tiny-pressure',
    label: 'Sync',
    mode: { kind: 'determinate', value: 3, max: 4 },
    display: 'bar+value+percent',
    elapsedMs: 65_000,
    barWidth: 10,
    status: 'success'
  }), { columns: 6, rows: 1 });

  assert.equal(renderFramePlain(normal), '✓ ████████░░ 3/4 75%');
  assert.equal(renderFramePlain(tight), '✓ ██░ 75%');
  assert.equal(renderFramePlain(tiny), '✓ ███░');
  assert.equal(tight.cells.some((cell) => cell.source?.description === 'percentage'), true);
  assert.equal(tight.cells.some((cell) => cell.source?.description === 'value'), false);
  assert.equal(tight.cells.some((cell) => cell.source?.description === 'label'), false);
  assert.equal(tiny.cells.some((cell) => cell.source?.description === 'filled'), true);
  assert.equal(tiny.cells.some((cell) => cell.source?.description === 'percentage'), false);
});

test('progressBar renders indeterminate bars with scoped progress accessibility', () => {
  const frame = renderElementFrame(progressBar({
    id: 'waiting',
    label: 'Waiting',
    mode: { kind: 'indeterminate', frame: 1 },
    barWidth: 4,
    status: 'warning'
  }), { columns: 24, rows: 1 });
  const activeCell = frame.cells.find((cell) => cell.source?.description === 'active');
  const markerCell = frame.cells.find((cell) => cell.source?.description === 'status.marker');

  assert.equal(renderFramePlain(frame), '! Waiting ░██░');
  assert.equal(markerCell?.text, '!');
  assert.equal(activeCell?.style?.fg?.token, 'status.warning');
  assert.equal(activeCell?.source?.cellRole, 'decoration');
  assert.deepEqual(frame.accessibility.root.numericValue, { indeterminate: true });
});

test('progressBar rejects invalid caller-supplied progress modes', () => {
  assert.throws(
    () => progressBar({ id: 'nan-value', label: 'Progress', mode: { kind: 'determinate', value: Number.NaN } }),
    /value must be finite/u
  );
  assert.throws(
    () => progressBar({ id: 'zero-max', label: 'Progress', mode: { kind: 'determinate', value: 1, max: 0 } }),
    /max must be finite and greater than zero/u
  );
  assert.throws(
    () => progressBar({ id: 'nan-frame', label: 'Progress', mode: { kind: 'indeterminate', frame: Number.NaN } }),
    /frame must be finite/u
  );
});

test('progressBar clamps 0 percent 100 percent and overflow values visibly', () => {
  const empty = renderElementFrame(progressBar({
    id: 'empty',
    label: 'Progress',
    labelPosition: 'none',
    mode: { kind: 'determinate', value: 0, max: 10 },
    barWidth: 4,
    display: 'bar+percent'
  }), { columns: 12, rows: 1 });
  const complete = renderElementFrame(progressBar({
    id: 'complete',
    label: 'Progress',
    labelPosition: 'none',
    mode: { kind: 'determinate', value: 10, max: 10 },
    barWidth: 4,
    display: 'bar+percent'
  }), { columns: 12, rows: 1 });
  const overflow = renderElementFrame(progressBar({
    id: 'overflow',
    label: 'Progress',
    labelPosition: 'none',
    mode: { kind: 'determinate', value: 25, max: 10 },
    barWidth: 4,
    display: 'bar+percent'
  }), { columns: 12, rows: 1 });

  assert.equal(renderFramePlain(empty), '░░░░ 0%');
  assert.equal(renderFramePlain(complete), '████ 100%');
  assert.equal(renderFramePlain(overflow), '████ 100%');
  assert.deepEqual(empty.accessibility.root.numericValue, { current: 0, minimum: 0, maximum: 10 });
  assert.deepEqual(complete.accessibility.root.numericValue, { current: 10, minimum: 0, maximum: 10 });
  assert.deepEqual(overflow.accessibility.root.numericValue, { current: 10, minimum: 0, maximum: 10 });
});

test('progressBar visual snapshots stay readable in high contrast and no color modes', () => {
  const frame = renderElementFrame(progressBar({
    id: 'themed-progress',
    label: 'Theme',
    mode: { kind: 'determinate', value: 2, max: 4 },
    barWidth: 4,
    display: 'bar+value+percent',
    status: 'warning'
  }), { columns: 32, rows: 1 }, { theme: highContrastTheme });
  const highContrast = createVisualSnapshot({
    frame,
    ansi: { capabilities: colorCapabilities(), theme: highContrastTheme }
  });
  const noColor = createVisualSnapshot({
    frame,
    ansi: { capabilities: noColorCapabilities(), theme: highContrastTheme }
  });

  assert.equal(highContrast.plainTextFrame, '! Theme ##-- 2/4 50%');
  assert.match(highContrast.ansiFrame, /\\x1b\[/u);
  assert.match(highContrast.frameJson, /"token": "status.warning"/u);
  assert.equal(noColor.plainTextFrame, highContrast.plainTextFrame);
  assert.doesNotMatch(noColor.ansiFrame, /\\x1b\[[0-9;]*m/u);
});

function colorCapabilities() {
  return resolveTerminalCapabilities({
    host: {
      runtime: 'memory',
      inputIsTty: true,
      outputIsTty: true,
      supportsRawInput: true
    }
  });
}

function noColorCapabilities() {
  return {
    ...colorCapabilities(),
    color: {
      depth: 0,
      hasBasicColors: false,
      has256Colors: false,
      hasTrueColor: false
    }
  };
}
