import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveTerminalCapabilities
} from '../../dist/host/index.js';
import {
  notificationHistory,
  notificationRegion,
  text
} from '../../dist/components/index.js';
import {
  renderElementFrame,
  renderFramePlain
} from '../../dist/renderer/index.js';
import { renderElementRegions } from '../../dist/renderer/internal/render.js';
import { grid } from '../../dist/layout/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import { highContrastTheme } from '../../dist/theme/index.js';
import { measureTextCells } from '../../dist/text/index.js';
import { routedPointerEvent } from '../helpers/pointer.ts';

test('notificationRegion is a live region with focusable explicit dismiss actions', () => {
  const element = notificationRegion({
    id: 'notices',
    items: [{
      id: 'build',
      title: 'Build complete',
      message: 'No errors',
      tone: 'success',
      dismissible: true
    }],
    onAction: (action) => ({ kind: 'notification', action })
  });
  const frame = renderElementFrame(element, { columns: 40, rows: 8 });
  const targets = renderElementRegions(element, { columns: 40, rows: 8 })
    .flatMap((region) => region.hitTargets);

  assert.equal(frame.accessibility.root.role, 'status');
  assert.equal(frame.accessibility.root.live, 'polite');
  assert.deepEqual(frame.focusPath, [
    'notices',
    'notices:notification:build:dismiss'
  ]);
  assert.deepEqual(
    targets[0]?.message(routedPointerEvent()),
    { kind: 'notification', action: { kind: 'dismiss', id: 'build' } }
  );
});

test('notificationHistory is a controlled listbox over completed notifications', () => {
  const element = notificationHistory({
    id: 'history',
    selectedId: 'build',
    items: [{
      id: 'build',
      title: 'Build complete',
      tone: 'success',
      dismissible: true
    }],
    onAction: (action) => action
  });
  const frame = renderElementFrame(element, { columns: 40, rows: 8 });
  const targets = renderElementRegions(element, { columns: 40, rows: 8 })
    .flatMap((region) => region.hitTargets);
  const dismiss = targets.find((target) => target.id.endsWith(':dismiss'));

  assert.equal(frame.accessibility.root.role, 'listbox');
  assert.equal(frame.accessibility.root.children?.[0]?.selected, true);
  assert.deepEqual(
    dismiss?.message(routedPointerEvent()),
    { kind: 'remove', id: 'build' }
  );
});

test('notification components reject ambiguous identity', () => {
  assert.throws(() => notificationRegion({
    id: 'duplicates',
    items: [
      { id: 'same', title: 'One' },
      { id: 'same', title: 'Two' }
    ]
  }), /unique/u);
});

test('notification components reject invalid tone and progress values', () => {
  assert.throws(() => notificationRegion({
    id: 'invalid-tone',
    items: [{ id: 'broken', title: 'Broken', tone: 'fatal' }]
  }), (error) => error.name === 'ComponentExecutionError' && error.cause instanceof TypeError);
  assert.throws(() => notificationRegion({
    id: 'invalid-progress',
    items: [{ id: 'broken', title: 'Broken', progress: Number.NaN }]
  }), (error) => error.name === 'ComponentExecutionError' && error.cause instanceof RangeError);
});

test('passive notifications do not paint an inert dismissal affordance', () => {
  const frame = renderElementFrame(notificationRegion({
    id: 'passive-notices',
    items: [{ id: 'passive', title: 'Passive' }]
  }), { columns: 32, rows: 8 });

  assert.equal(frame.focusPath, undefined);
  assert.equal(frame.hitTargets?.length ?? 0, 0);
  assert.equal(frame.cells.some((cell) => cell.source?.description === 'dismiss'), false);
  assert.doesNotMatch(renderFramePlain(frame), /×/u);
  assert.equal(frame.accessibility.root.role, 'status');
  assert.equal(frame.accessibility.root.live, 'polite');
  assert.equal(frame.accessibility.root.children?.[0]?.children?.length, 0);
});

test('notification progress preserves its terminal-cell budget under wide profiles', () => {
  const widthProfile = { emoji: 'wide', ambiguous: 'wide' };
  const frame = renderElementFrame(notificationRegion({
    id: 'wide-notice',
    items: [{
      id: 'progress',
      title: 'Working',
      message: 'Still working',
      tone: 'progress',
      progress: 50
    }],
    maxWidth: 20
  }), { columns: 22, rows: 7 }, { widthProfile });
  const progressText = frame.cells
    .filter((cell) => cell.source?.description === 'progress.filled'
      || cell.source?.description === 'progress.empty')
    .filter((cell) => cell.width > 0)
    .map((cell) => cell.text)
    .join('');

  assert.equal(measureTextCells(progressText, { widthProfile }).cells, 12);
  assert.equal(frame.cells.some((cell) =>
    cell.source?.description === 'progress.value' && cell.text === '5'
  ), true);
});

test('notification cards middle-clip compact title and message lines', () => {
  const frame = renderElementFrame(notificationRegion({
    id: 'notices',
    items: [{
      id: 'long-path',
      title: 'Opened /home/ismail-el-korchi/Documents/Projects/terminal-ui/src/accessibility/snapshot.ts',
      message: 'Stored /home/ismail-el-korchi/Documents/Projects/terminal-ui/src/accessibility/snapshot.ts',
      tone: 'success'
    }],
    maxWidth: 32
  }), { columns: 42, rows: 8 });
  const output = renderFramePlain(frame);

  assert.match(output, /Opened \/home\/is…ty\/snapshot\.ts/u);
  assert.match(output, /Stored \/home\/is…ty\/snapshot\.ts/u);
});

test('notification placement supports top, bottom, and centered presets', () => {
  const item = { id: 'notice', title: 'Notice' };
  const frames = ['top-right', 'bottom-right', 'centered-stack'].map((placement) =>
    renderElementFrame(notificationRegion({
      id: `notices-${placement}`,
      items: [item],
      placement
    }), { columns: 80, rows: 24 })
  );
  const bounds = frames.map((frame) => {
    const cells = frame.cells.filter((cell) => cell.source?.itemId === 'notice');
    return {
      top: Math.min(...cells.map((cell) => cell.row)),
      left: Math.min(...cells.map((cell) => cell.column)),
      bottom: Math.max(...cells.map((cell) => cell.row)),
      right: Math.max(...cells.map((cell) => cell.column))
    };
  });

  assert.equal(bounds[0]?.top, 2);
  assert.equal(bounds[0]?.right, 79);
  assert.equal(bounds[1]?.bottom, 23);
  assert.equal(bounds[1]?.right, 79);
  assert.equal(bounds[2]?.top, 11);
  assert.equal(bounds[2]?.left, 31);
});

test('notification regions remain constrained by allocated layout bounds', () => {
  const frame = renderElementFrame(grid({
    areas: `
      main notices
    `,
    columns: [{ kind: 'fill' }, { kind: 'fixed', cells: 24 }],
    rows: [{ kind: 'fill' }],
    children: {
      main: text({ content: 'Main content' }),
      notices: notificationRegion({
        id: 'bounded-notices',
        items: [{ id: 'saved', title: 'Saved', message: 'State stored', tone: 'success' }],
        maxWidth: 22
      })
    }
  }), { columns: 60, rows: 12 });
  const notificationCells = frame.cells.filter((cell) =>
    cell.source?.elementKind === 'terminal-ui/components/notification-region'
  );

  assert.ok(notificationCells.length > 0);
  assert.equal(notificationCells.every((cell) => cell.column >= 36), true);
  assert.match(renderFramePlain(frame), /Saved/u);
});

test('notification regions omit cards from undersized bounds', () => {
  const frame = renderElementFrame(notificationRegion({
    id: 'undersized-notices',
    items: [{ id: 'saved', title: 'Saved', message: 'State stored', tone: 'success' }],
    maxWidth: 24
  }), { columns: 28, rows: 2 });

  assert.equal(frame.cells.some((cell) =>
    cell.source?.elementKind === 'terminal-ui/components/notification-region'
  ), false);
  assert.doesNotMatch(renderFramePlain(frame), /Saved/u);
});

test('notification history keeps tone, progress, and selection meaningful without color', () => {
  const frame = renderElementFrame(notificationHistory({
    id: 'history-output',
    items: [{
      id: 'failure',
      title: 'Sync failed',
      message: 'Retry required',
      tone: 'error',
      progress: 75
    }],
    selectedId: 'failure',
    maxWidth: 28,
    onAction: (action) => action
  }), { columns: 40, rows: 8 }, { theme: highContrastTheme });
  const highContrast = createVisualSnapshot({
    frame,
    ansi: { capabilities: colorCapabilities(), theme: highContrastTheme }
  });
  const noColor = createVisualSnapshot({
    frame,
    ansi: { capabilities: noColorCapabilities(), theme: highContrastTheme }
  });

  assert.match(highContrast.plainTextFrame, /> error/u);
  assert.match(highContrast.plainTextFrame, /Sync failed/u);
  assert.match(highContrast.plainTextFrame, /Retry required/u);
  assert.match(highContrast.plainTextFrame, /75%/u);
  assert.equal(noColor.plainTextFrame, highContrast.plainTextFrame);
  assert.doesNotMatch(noColor.ansiFrame, /\x1b\[[0-9;]*m/u);
});

test('notificationHistory rejects invalid runtime contracts during construction', () => {
  assert.throws(() => notificationHistory({
    id: 'missing-handler',
    items: []
  }), /requires onAction to map its semantic actions/u);
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
