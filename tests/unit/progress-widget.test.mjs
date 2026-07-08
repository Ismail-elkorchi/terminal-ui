import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTerminalCapabilities } from '../../dist/host/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import { highContrastTheme } from '../../dist/theme/index.js';
import { renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import { progressBar } from '../../dist/widgets/index.js';

test('progressBar supports value plus percentage display and status tone', () => {
  const frame = renderWidgetFrame(progressBar({
    id: 'deploy',
    label: 'Deploy',
    value: 5,
    max: 10,
    barWidth: 4,
    display: 'bar+value+percent',
    status: 'success'
  }), { columns: 32, rows: 1 });
  const filledCell = frame.cells.find((cell) => cell.text === '█');
  const markerCell = frame.cells.find((cell) => cell.source?.label === 'status.marker');
  const valueCell = frame.cells.find((cell) => cell.source?.label === 'value' && cell.text === '5');
  const percentageCell = frame.cells.find((cell) => cell.source?.label === 'percentage' && cell.text === '5');

  assert.equal(renderFramePlain(frame), '✓ Deploy [██░░] 5/10 50%');
  assert.equal(markerCell?.text, '✓');
  assert.equal(markerCell?.source?.role, 'decoration');
  assert.deepEqual(filledCell?.style?.fg, { kind: 'theme', token: 'status.success' });
  assert.equal(filledCell?.style?.bold, true);
  assert.equal(filledCell?.source?.label, 'filled');
  assert.equal(filledCell?.source?.role, 'decoration');
  assert.equal(valueCell?.text, '5');
  assert.equal(percentageCell?.text, '5');
  assert.deepEqual(frame.accessibility.root.progress, { value: 5, max: 10 });
});

test('progressBar supports bar-only display with end label and explicit bar width', () => {
  const frame = renderWidgetFrame(progressBar({
    id: 'compact',
    label: 'Build',
    value: 1,
    max: 4,
    barWidth: 4,
    display: 'bar',
    labelPosition: 'end'
  }), { columns: 32, rows: 1 });
  const filled = frame.cells.find((cell) => cell.source?.label === 'filled');
  const empty = frame.cells.find((cell) => cell.source?.label === 'track');

  assert.equal(renderFramePlain(frame), '[█░░░] Build');
  assert.equal(filled?.style?.fg?.token, 'control.track.filled');
  assert.equal(filled?.style?.bold, true);
  assert.equal(empty?.style?.fg?.token, 'control.track');
  assert.equal(empty?.style?.dim, true);
});

test('progressBar valueScale renders segmented fill tokens', () => {
  const frame = renderWidgetFrame(progressBar({
    id: 'scaled-progress',
    value: 8,
    max: 10,
    barWidth: 5,
    display: 'bar',
    labelPosition: 'none',
    valueScale: [
      { at: 0, token: 'scale.low' },
      { at: 0.5, token: 'scale.high' },
      { at: 0.75, token: 'scale.critical' }
    ]
  }), { columns: 12, rows: 1 });

  const segments = frame.cells.filter((cell) => cell.source?.label?.startsWith('segment.') === true);

  assert.equal(renderFramePlain(frame), '[████░]');
  assert.equal(segments.length, 4);
  assert.equal(segments[0]?.style?.fg?.token, 'scale.low');
  assert.equal(segments[2]?.style?.fg?.token, 'scale.high');
  assert.equal(segments[3]?.style?.fg?.token, 'scale.critical');
});

test('progressBar renders explicit elapsed and remaining timing without hidden clocks', () => {
  const frame = renderWidgetFrame(progressBar({
    id: 'timed',
    label: 'Upload',
    value: 2,
    max: 4,
    barWidth: 4,
    display: 'bar+value+percent',
    elapsedMs: 65_000,
    remainingMs: 125_000
  }), { columns: 64, rows: 1 });

  assert.equal(renderFramePlain(frame), 'Upload [██░░] 2/4 50% 1m05s elapsed 2m05s left');
  assert.equal(frame.accessibility.root.description, '1m05s elapsed 2m05s left');
});

test('progressBar ignores invalid timing fields', () => {
  const frame = renderWidgetFrame(progressBar({
    id: 'invalid-timing',
    label: 'Sync',
    value: 1,
    max: 2,
    elapsedMs: -1,
    remainingMs: Number.NaN
  }), { columns: 32, rows: 1 });

  assert.equal(renderFramePlain(frame), 'Sync [█████░░░░░] 1/2');
  assert.equal(frame.accessibility.root.description, undefined);
});

test('progressBar supports label-free percentage and tiny viewport clipping', () => {
  const frame = renderWidgetFrame(progressBar({
    id: 'tiny',
    label: 'Hidden',
    labelPosition: 'none',
    value: 3,
    max: 4,
    barWidth: 4,
    display: 'bar+percent'
  }), { columns: 6, rows: 1 });

  assert.equal(renderFramePlain(frame), '[███░]');
  assert.deepEqual(frame.accessibility.root.progress, { value: 3, max: 4 });
});

test('progressBar degrades display parts deterministically under width pressure', () => {
  const normal = renderWidgetFrame(progressBar({
    id: 'normal-pressure',
    label: 'Sync',
    value: 3,
    max: 4,
    display: 'bar+value+percent',
    elapsedMs: 65_000,
    barWidth: 10,
    status: 'success'
  }), { columns: 20, rows: 1 });
  const tight = renderWidgetFrame(progressBar({
    id: 'tight-pressure',
    label: 'Sync',
    value: 3,
    max: 4,
    display: 'bar+value+percent',
    elapsedMs: 65_000,
    barWidth: 10,
    status: 'success'
  }), { columns: 9, rows: 1 });
  const tiny = renderWidgetFrame(progressBar({
    id: 'tiny-pressure',
    label: 'Sync',
    value: 3,
    max: 4,
    display: 'bar+value+percent',
    elapsedMs: 65_000,
    barWidth: 10,
    status: 'success'
  }), { columns: 6, rows: 1 });

  assert.equal(renderFramePlain(normal), '✓ [██████░░] 3/4 75%');
  assert.equal(renderFramePlain(tight), '✓ [█] 75%');
  assert.equal(renderFramePlain(tiny), '✓ [██]');
  assert.equal(tight.cells.some((cell) => cell.source?.label === 'percentage'), true);
  assert.equal(tight.cells.some((cell) => cell.source?.label === 'value'), false);
  assert.equal(tight.cells.some((cell) => cell.source?.label === 'label'), false);
  assert.equal(tiny.cells.some((cell) => cell.source?.label === 'filled'), true);
  assert.equal(tiny.cells.some((cell) => cell.source?.label === 'percentage'), false);
});

test('progressBar renders indeterminate bars with scoped progress accessibility', () => {
  const frame = renderWidgetFrame(progressBar({
    id: 'waiting',
    label: 'Waiting',
    indeterminate: true,
    barWidth: 4,
    frame: 1,
    status: 'warning'
  }), { columns: 24, rows: 1 });
  const activeCell = frame.cells.find((cell) => cell.source?.label === 'active');
  const markerCell = frame.cells.find((cell) => cell.source?.label === 'status.marker');

  assert.equal(renderFramePlain(frame), '! Waiting [░██░]');
  assert.equal(markerCell?.text, '!');
  assert.equal(activeCell?.style?.fg?.token, 'status.warning');
  assert.equal(activeCell?.source?.role, 'decoration');
  assert.deepEqual(frame.accessibility.root.progress, { indeterminate: true });
});

test('progressBar clamps 0 percent 100 percent and overflow values visibly', () => {
  const empty = renderWidgetFrame(progressBar({
    id: 'empty',
    labelPosition: 'none',
    value: 0,
    max: 10,
    barWidth: 4,
    display: 'bar+percent'
  }), { columns: 12, rows: 1 });
  const complete = renderWidgetFrame(progressBar({
    id: 'complete',
    labelPosition: 'none',
    value: 10,
    max: 10,
    barWidth: 4,
    display: 'bar+percent'
  }), { columns: 12, rows: 1 });
  const overflow = renderWidgetFrame(progressBar({
    id: 'overflow',
    labelPosition: 'none',
    value: 25,
    max: 10,
    barWidth: 4,
    display: 'bar+percent'
  }), { columns: 12, rows: 1 });

  assert.equal(renderFramePlain(empty), '[░░░░] 0%');
  assert.equal(renderFramePlain(complete), '[████] 100%');
  assert.equal(renderFramePlain(overflow), '[████] 100%');
  assert.deepEqual(empty.accessibility.root.progress, { value: 0, max: 10 });
  assert.deepEqual(complete.accessibility.root.progress, { value: 10, max: 10 });
  assert.deepEqual(overflow.accessibility.root.progress, { value: 10, max: 10 });
});

test('progressBar visual snapshots stay readable in high contrast and no color modes', () => {
  const frame = renderWidgetFrame(progressBar({
    id: 'themed-progress',
    label: 'Theme',
    value: 2,
    max: 4,
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

  assert.equal(highContrast.plainTextFrame, '! Theme [##--] 2/4 50%');
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
      rawInput: true
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
