import assert from 'node:assert/strict';
import test from 'node:test';

import { createCapabilities } from '../../dist/host/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import { highContrastTheme } from '../../dist/theme/index.js';
import { renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import { progressBar } from '../../dist/widgets/index.js';

test('progressBar supports full mode percentage width and status tone', () => {
  const frame = renderWidgetFrame(progressBar({
    id: 'deploy',
    label: 'Deploy',
    value: 5,
    max: 10,
    barWidth: 4,
    showPercentage: true,
    status: 'success'
  }), { columns: 32, rows: 1 });
  const filledCell = frame.cells.find((cell) => cell.text === '█');

  assert.equal(renderFramePlain(frame), 'Deploy [██░░] 5/10 50%');
  assert.deepEqual(filledCell?.style?.fg, { kind: 'theme', token: 'status.success' });
  assert.equal(filledCell?.style?.bold, true);
  assert.deepEqual(frame.accessibility.root.progress, { value: 5, max: 10 });
});

test('progressBar supports compact mode end label and explicit bar width', () => {
  const frame = renderWidgetFrame(progressBar({
    id: 'compact',
    label: 'Build',
    value: 1,
    max: 4,
    barWidth: 4,
    mode: 'compact',
    labelPosition: 'end'
  }), { columns: 32, rows: 1 });

  assert.equal(renderFramePlain(frame), '[█░░░] Build');
});

test('progressBar renders explicit elapsed and remaining timing without hidden clocks', () => {
  const frame = renderWidgetFrame(progressBar({
    id: 'timed',
    label: 'Upload',
    value: 2,
    max: 4,
    barWidth: 4,
    showPercentage: true,
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
    mode: 'compact',
    showPercentage: true
  }), { columns: 6, rows: 1 });

  assert.equal(renderFramePlain(frame), '[███░]');
  assert.deepEqual(frame.accessibility.root.progress, { value: 3, max: 4 });
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

  assert.equal(renderFramePlain(frame), 'Waiting [░██░]');
  assert.deepEqual(frame.accessibility.root.progress, { indeterminate: true });
});

test('progressBar clamps 0 percent 100 percent and overflow values visibly', () => {
  const empty = renderWidgetFrame(progressBar({
    id: 'empty',
    labelPosition: 'none',
    value: 0,
    max: 10,
    barWidth: 4,
    mode: 'compact',
    showPercentage: true
  }), { columns: 12, rows: 1 });
  const complete = renderWidgetFrame(progressBar({
    id: 'complete',
    labelPosition: 'none',
    value: 10,
    max: 10,
    barWidth: 4,
    mode: 'compact',
    showPercentage: true
  }), { columns: 12, rows: 1 });
  const overflow = renderWidgetFrame(progressBar({
    id: 'overflow',
    labelPosition: 'none',
    value: 25,
    max: 10,
    barWidth: 4,
    mode: 'compact',
    showPercentage: true
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
    showPercentage: true,
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

  assert.equal(highContrast.plainTextFrame, 'Theme [##--] 2/4 50%');
  assert.match(highContrast.ansiFrame, /\\x1b\[/u);
  assert.match(highContrast.frameJson, /"token": "status.warning"/u);
  assert.equal(noColor.plainTextFrame, highContrast.plainTextFrame);
  assert.doesNotMatch(noColor.ansiFrame, /\\x1b\[[0-9;]*m/u);
});

function colorCapabilities() {
  return createCapabilities({
    runtime: 'memory',
    inputIsTty: true,
    outputIsTty: true,
    rawInput: true
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
