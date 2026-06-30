import assert from 'node:assert/strict';
import test from 'node:test';

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
      { id: 'deploy', title: 'Deploying', message: 'Harbor route update', tone: 'progress', progress: 42 },
      { id: 'done', title: 'Saved', message: 'State stored', tone: 'success' }
    ],
    placement: 'top-right',
    maxVisible: 2,
    maxWidth: 28
  }), { columns: 48, rows: 14 });
  const output = renderFramePlain(frame);
  const border = frame.cells.find((cell) => cell.source?.role === 'border');
  const progressCell = frame.cells.find((cell) => cell.source?.label === 'progress' && cell.text.length > 0);

  assert.match(output, /Deploying/u);
  assert.match(output, /Harbor route update/u);
  assert.match(output, /Saved/u);
  assert.deepEqual(border?.style?.fg, { kind: 'theme', token: 'surface.selected.border' });
  assert.equal(progressCell?.source?.kind, 'notification');
  assert.equal(frame.accessibility.root.role, 'status');
  assert.equal(frame.accessibility.root.scope?.kind, 'popover');
  assert.equal(frame.accessibility.root.children?.length, 2);
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
