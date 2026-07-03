import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTerminalCapabilities } from '../../dist/host/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import { highContrastTheme } from '../../dist/theme/index.js';
import {
  placeNotificationStack,
  renderFramePlain,
  renderWidgetFrame
} from '../../dist/tui/index.js';
import { notificationStack } from '../../dist/widgets/index.js';

test('notificationStack renders stacked status cards with semantic styles and accessibility', () => {
  const frame = renderWidgetFrame(notificationStack({
    id: 'notices',
    items: [
      {
        id: 'deploy',
        title: 'Deploying',
        message: 'Harbor route update',
        tone: 'progress',
        progress: 42,
        paused: true,
        createdAt: 0,
        expiresAt: 5_000
      },
      { id: 'done', title: 'Saved', message: 'State stored', tone: 'success' }
    ],
    selected: 0,
    placement: 'top-right',
    maxVisible: 2,
    maxWidth: 28
  }), { columns: 48, rows: 14 });
  const output = renderFramePlain(frame);
  const border = frame.cells.find((cell) => cell.source?.role === 'border');
  const progressCell = frame.cells.find((cell) => cell.source?.label === 'progress.filled' && cell.text.length > 0);
  const progressValue = frame.cells.find((cell) => cell.source?.label === 'progress.value' && cell.text === '4');
  const selectedTitle = frame.cells.find((cell) => cell.source?.itemId === 'deploy' && cell.source?.label === 'title');
  const selectedMessage = frame.cells.find((cell) => cell.source?.itemId === 'deploy' && cell.source?.label === 'message');
  const selectedMeta = frame.cells.find((cell) => cell.source?.itemId === 'deploy' && cell.source?.label === 'meta');
  const background = frame.cells.find((cell) => cell.source?.itemId === 'deploy' && cell.source?.label === 'background');

  assert.match(output, /Deploying/u);
  assert.match(output, /Harbor route update/u);
  assert.match(output, /paused · ttl 5s/u);
  assert.match(output, /› progress paused/u);
  assert.match(output, /Saved/u);
  assert.deepEqual(border?.style?.fg, { kind: 'theme', token: 'selection.foreground' });
  assert.equal(progressCell?.source?.ownerKind, 'notificationStack');
  assert.equal(progressCell?.source?.partKind, 'notification');
  assert.equal(progressCell?.source?.role, 'decoration');
  assert.equal(progressValue?.source?.ownerKind, 'notificationStack');
  assert.equal(progressValue?.source?.partKind, 'notification');
  assert.deepEqual(selectedTitle?.style?.bg, { kind: 'theme', token: 'selection.background' });
  assert.equal(selectedMessage?.source?.role, 'text');
  assert.equal(selectedMeta?.source?.role, 'text');
  assert.equal(background?.source?.role, 'decoration');
  assert.equal(frame.accessibility.root.role, 'status');
  assert.equal(frame.accessibility.root.scope?.kind, 'popover');
  assert.equal(frame.accessibility.root.children?.length, 2);
  assert.equal(frame.accessibility.root.children?.[0]?.selected, true);
  assert.match(frame.accessibility.root.children?.[0]?.description ?? '', /paused · ttl 5s/u);
});

test('notificationStack creates keyboard dismiss mappings for the selected visible item', () => {
  const widget = notificationStack({
    items: [
      { id: 'a', title: 'First' },
      { id: 'b', title: 'Second' }
    ],
    selected: 1,
    toDismissMessage: (item) => ({ kind: 'dismiss', id: item.id })
  });

  assert.deepEqual(widget.keyMap?.escape, { kind: 'dismiss', id: 'b' });
  assert.deepEqual(widget.keyMap?.delete, { kind: 'dismiss', id: 'b' });
  assert.deepEqual(widget.keyMap?.backspace, { kind: 'dismiss', id: 'b' });
  assert.equal(renderWidgetFrame(widget, { columns: 32, rows: 8 }).focusPath, undefined);
});

test('notificationStack can opt into focus explicitly', () => {
  const frame = renderWidgetFrame(notificationStack({
    id: 'focusable-notices',
    items: [{ id: 'a', title: 'Focusable' }],
    focus: { disabled: false },
    keyMap: { enter: { kind: 'open' } }
  }), { columns: 32, rows: 8 });

  assert.deepEqual(frame.focusPath, ['focusable-notices']);
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

test('notificationStack keeps tone progress and selection meaningful in no color output', () => {
  const frame = renderWidgetFrame(notificationStack({
    id: 'notices',
    items: [{
      id: 'failure',
      title: 'Sync failed',
      message: 'Retry required',
      tone: 'error',
      progress: 75
    }],
    selected: 0,
    maxVisible: 1,
    maxWidth: 28
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
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'progress.filled')?.source?.role, 'decoration');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'progress.value')?.source?.role, 'text');
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
