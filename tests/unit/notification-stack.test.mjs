import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveTerminalCapabilities } from '../../dist/host/index.js';
import {
  createVisualSnapshot
} from '../../dist/testing/index.js';
import { renderElementRegions } from '../../dist/renderer/internal/render.js';
import { placeNotificationStack } from '../../dist/renderer/internal/notifications.js';
import { highContrastTheme } from '../../dist/theme/index.js';
import { measureTextCells } from '../../dist/text/index.js';
import {
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import { grid } from '../../dist/layout/index.js';
import {
  notificationStack,
  text
} from '../../dist/components/index.js';

test('notification authoring rejects malformed items instead of omitting them', () => {
  assert.throws(() => notificationStack({
    id: 'invalid-notices',
    presentation: {
      kind: 'live',
      items: [{ id: 'broken', title: 'Broken', tone: 'fatal' }]
    }
  }), TypeError);
  assert.throws(() => notificationStack({
    id: 'invalid-progress',
    presentation: {
      kind: 'live',
      items: [{ id: 'broken', title: 'Broken', progress: Number.NaN }]
    }
  }), RangeError);
});

test('notificationStack renders stacked status cards with semantic styles and accessibility', () => {
  const frame = renderElementFrame(notificationStack({
    id: 'notices',
    presentation: { kind: 'history', items: [
      {
        id: 'deploy',
        title: 'Deploying',
        message: 'Harbor route update',
        tone: 'progress',
        progress: 42,
        detail: 'paused · ttl 5s'
      },
      { id: 'done', title: 'Saved', message: 'State stored', tone: 'success' }
    ], selected: 'deploy' },
    placement: 'top-right',
    maxWidth: 28,
    onAction: (action) => action
  }), { columns: 48, rows: 14 });
  const output = renderFramePlain(frame);
  const border = frame.cells.find((cell) => cell.source?.cellRole === 'border');
  const progressCell = frame.cells.find((cell) => cell.source?.description === 'progress.filled' && cell.text.length > 0);
  const progressValue = frame.cells.find((cell) => cell.source?.description === 'progress.value' && cell.text === '4');
  const selectedTitle = frame.cells.find((cell) => cell.source?.itemId === 'deploy' && cell.source?.description === 'title');
  const selectedMessage = frame.cells.find((cell) => cell.source?.itemId === 'deploy' && cell.source?.description === 'message');
  const selectedMeta = frame.cells.find((cell) => cell.source?.itemId === 'deploy' && cell.source?.description === 'meta');
  const background = frame.cells.find((cell) => cell.source?.itemId === 'deploy' && cell.source?.description === 'background');

  assert.match(output, /Deploying/u);
  assert.match(output, /Harbor route update/u);
  assert.match(output, /paused · ttl 5s/u);
  assert.match(output, /› progress/u);
  assert.match(output, /Saved/u);
  assert.deepEqual(border?.style?.fg, { kind: 'theme', token: 'selection.foreground' });
  assert.equal(progressCell?.source?.elementKind, 'notificationStack');
  assert.equal(progressCell?.source?.partType, 'notification');
  assert.equal(progressCell?.source?.cellRole, 'decoration');
  assert.equal(progressValue?.source?.elementKind, 'notificationStack');
  assert.equal(progressValue?.source?.partType, 'notification');
  assert.deepEqual(selectedTitle?.style?.bg, { kind: 'theme', token: 'selection.background' });
  assert.equal(selectedMessage?.source?.cellRole, 'text');
  assert.equal(selectedMeta?.source?.cellRole, 'text');
  assert.equal(background?.source?.cellRole, 'decoration');
  assert.equal(frame.accessibility.root.role, 'listbox');
  assert.equal(frame.accessibility.root.scope?.kind, 'popover');
  assert.equal(frame.accessibility.root.children?.length, 2);
  assert.equal(frame.accessibility.root.children?.[0]?.role, 'option');
  assert.equal(frame.accessibility.root.children?.[0]?.selected, true);
  assert.match(frame.accessibility.root.children?.[0]?.description ?? '', /paused · ttl 5s/u);
});

test('notification progress fills an exact terminal-cell budget under wide profiles', () => {
  const widthProfile = { emoji: 'wide', ambiguous: 'wide' };
  const frame = renderElementFrame(notificationStack({
    id: 'wide-notice',
    presentation: { kind: 'live', items: [{
      id: 'progress',
      title: 'Working',
      message: 'Still working',
      tone: 'progress',
      progress: 50
    }] },
    maxWidth: 20
  }), { columns: 22, rows: 7 }, { widthProfile });
  const progressText = frame.cells
    .filter((cell) => cell.source?.description === 'progress.filled' || cell.source?.description === 'progress.empty')
    .filter((cell) => cell.width > 0)
    .map((cell) => cell.text)
    .join('');

  assert.equal(measureTextCells(progressText, { widthProfile }).cells, 12);
  assert.equal(frame.cells.some((cell) => cell.source?.description === 'progress.value' && cell.text === '5'), true);
});

test('notificationStack middle-clips compact title and message lines', () => {
  const frame = renderElementFrame(notificationStack({
    id: 'notices',
    presentation: { kind: 'live', items: [{
      id: 'long-path',
      title: 'Opened /home/ismail-el-korchi/Documents/Projects/terminal-ui/src/accessibility/snapshot.ts',
      message: 'Stored /home/ismail-el-korchi/Documents/Projects/terminal-ui/src/accessibility/snapshot.ts',
      tone: 'success'
    }] },
    maxWidth: 32
  }), { columns: 42, rows: 8 });
  const output = renderFramePlain(frame);

  assert.match(output, /Opened \/home\/is…ty\/snapshot\.ts/u);
  assert.match(output, /Stored \/home\/is…ty\/snapshot\.ts/u);
});

test('notificationStack history is focusable and owns navigation bindings', () => {
  const frame = renderElementFrame(notificationStack({
    id: 'focusable-notices',
    presentation: { kind: 'history', items: [{ id: 'a', title: 'Focusable' }], selected: 'a' },
    onAction: (action) => action,
    keys: { enter: () => ({ kind: 'open' }) }
}), { columns: 32, rows: 8 });

  assert.deepEqual(frame.focusPath, ['focusable-notices']);
});

test('notificationStack live mode is a passive live region without selection targets', () => {
  const element = notificationStack({
    id: 'live-notices',
    presentation: { kind: 'live', items: [{ id: 'a', title: 'Passive', dismissible: false }] }
  });
  const frame = renderElementFrame(element, { columns: 32, rows: 8 });

  assert.equal(frame.focusPath, undefined);
  assert.equal(frame.hitTargets?.length ?? 0, 0);
  assert.equal(frame.accessibility.root.role, 'status');
  assert.equal(frame.accessibility.root.live, 'polite');
  assert.equal(frame.accessibility.root.children?.[0]?.role, 'status');
});

test('notificationStack live mode exposes pointer dismissal only for dismissible items', () => {
  const element = notificationStack({
    id: 'live-notices',
    presentation: {
      kind: 'live',
      items: [
        { id: 'fixed', title: 'Fixed', dismissible: false },
        { id: 'dismissible', title: 'Dismissible', dismissible: true }
      ]
    },
    onDismiss: (id) => ({ kind: 'dismiss', id })
  });
  const frame = renderElementFrame(element, { columns: 40, rows: 12 });
  const targets = renderElementRegions(element, { columns: 40, rows: 12 }).flatMap((region) => region.hitTargets);

  assert.equal(frame.hitTargets?.some((target) => target.id.includes('fixed:dismiss')) ?? false, false);
  const target = targets.find((candidate) => candidate.id.includes('dismissible:dismiss'));
  assert.ok(target);
  assert.deepEqual(target.message({
    kind: 'click',
    row: target.bounds.row,
    column: target.bounds.column,
    button: 'left'
  }), { kind: 'dismiss', id: 'dismissible' });
});

test('placeNotificationStack supports top, bottom, and centered placement presets', () => {
  const viewport = { row: 1, column: 1, width: 80, height: 24 };
  const size = { width: 20, height: 6 };

  assert.deepEqual(placeNotificationStack({ viewport, size, placement: 'top-right' }), {
    row: 2,
    column: 60,
    width: 20,
    height: 6
  });
  assert.deepEqual(placeNotificationStack({ viewport, size, placement: 'bottom-right' }), {
    row: 18,
    column: 60,
    width: 20,
    height: 6
  });
  assert.deepEqual(placeNotificationStack({ viewport, size, placement: 'centered-stack' }), {
    row: 10,
    column: 31,
    width: 20,
    height: 6
  });
});

test('notificationStack is constrained by its layout bounds', () => {
  const frame = renderElementFrame(grid({
    areas: `
      main notices
    `,
    columns: [{ kind: 'fill' }, { kind: 'fixed', cells: 24 }],
    rows: [{ kind: 'fill' }],
    children: {
      main: text('Main content'),
      notices: notificationStack({
        id: 'notices',
        presentation: { kind: 'live', items: [{ id: 'saved', title: 'Saved', message: 'State stored', tone: 'success' }] },
        maxWidth: 22
      })
    }
  }), { columns: 60, rows: 12 });
  const notificationCells = frame.cells.filter((cell) => cell.source?.elementKind === 'notificationStack');

  assert.ok(notificationCells.length > 0);
  assert.equal(notificationCells.every((cell) => cell.column >= 36), true);
  assert.match(renderFramePlain(frame), /Saved/u);
});

test('notificationStack skips cards when bounds cannot fit a viable card', () => {
  const frame = renderElementFrame(notificationStack({
    id: 'notices',
    presentation: { kind: 'live', items: [{ id: 'saved', title: 'Saved', message: 'State stored', tone: 'success' }] },
    maxWidth: 24
  }), { columns: 28, rows: 2 });
  const notificationCells = frame.cells.filter((cell) => cell.source?.elementKind === 'notificationStack');

  assert.equal(notificationCells.length, 0);
  assert.doesNotMatch(renderFramePlain(frame), /Saved/u);
});

test('notificationStack exposes dismiss hit targets for placed cards', () => {
  const element = notificationStack({
    id: 'notices',
    presentation: { kind: 'history', items: [{ id: 'saved', title: 'Saved', message: 'State stored', tone: 'success' }], selected: 'saved' },
    maxWidth: 24,
    onAction: (action) => action
  });
  const frame = renderElementFrame(element, { columns: 36, rows: 8 });
  const regions = renderElementRegions(element, { columns: 36, rows: 8 });

  const target = frame.hitTargets.find((candidate) => candidate.id === 'notices:notification:saved:dismiss');
  const routedTarget = regions.flatMap((region) => region.hitTargets).find((candidate) => candidate.id === 'notices:notification:saved:dismiss');

  assert.ok(target);
  assert.ok(routedTarget);
  assert.deepEqual(routedTarget.message({ kind: 'click', row: target.bounds.row, column: target.bounds.column, button: 'left' }), {
    kind: 'dismiss',
    id: 'saved'
  });
});

test('notificationStack keeps tone progress and selection meaningful in no color output', () => {
  const frame = renderElementFrame(notificationStack({
    id: 'notices',
    presentation: { kind: 'history', items: [{
      id: 'failure',
      title: 'Sync failed',
      message: 'Retry required',
      tone: 'error',
      progress: 75
    }], selected: 'failure' },
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
  assert.doesNotMatch(noColor.ansiFrame, /\\x1b\[[0-9;]*m/u);
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'progress.filled')?.source?.cellRole, 'decoration');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'progress.value')?.source?.cellRole, 'text');
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
