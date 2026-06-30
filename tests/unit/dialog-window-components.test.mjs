import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import {
  confirmDialog,
  floatingWindow,
  inputDialog,
  messageBox,
  text,
  windowReducer,
  wizardDialog
} from '../../dist/widgets/index.js';

function plain(widget, viewport = { columns: 64, rows: 16 }) {
  return renderFramePlain(renderWidgetFrame(widget, viewport));
}

test('dialog helpers compose modal widgets for common GUI flows', () => {
  const cases = [
    {
      name: 'messageBox',
      widget: messageBox({
        title: 'Message',
        message: 'Harbor ready',
        actions: [{ label: 'OK', message: { kind: 'ok' } }],
        width: 42,
        height: 10
      }),
      expected: [/Message/u, /Harbor ready/u, /OK/u]
    },
    {
      name: 'confirmDialog',
      widget: confirmDialog({
        title: 'Confirm',
        message: 'Launch handoff?',
        confirmMessage: { kind: 'yes' },
        cancelMessage: { kind: 'no' },
        width: 44,
        height: 10
      }),
      expected: [/Confirm/u, /Launch handoff/u, /Cancel/u]
    },
    {
      name: 'inputDialog',
      widget: inputDialog({
        title: 'Rename',
        label: 'Vessel',
        value: 'Atlas',
        submitMessage: { kind: 'save' },
        cancelMessage: { kind: 'cancel' },
        width: 44,
        height: 10
      }),
      expected: [/Rename/u, /Vessel/u, /Atlas/u, /Submit/u]
    },
    {
      name: 'wizardDialog',
      widget: wizardDialog({
        title: 'Wizard',
        steps: [{ id: 'plan', label: 'Plan' }, { id: 'commit', label: 'Commit' }],
        currentStep: 1,
        body: text('Review changes'),
        actions: [{ label: 'Next', message: { kind: 'next' } }],
        width: 50,
        height: 12
      }),
      expected: [/Wizard/u, /Commit/u, /Review changes/u, /Next/u]
    }
  ];

  for (const item of cases) {
    assert.equal(item.widget.kind, 'modal', `${item.name} should use the existing modal primitive`);
    const output = plain(item.widget);
    for (const expected of item.expected) {
      assert.match(output, expected, item.name);
    }
  }
});

test('floatingWindow is a positioned ordinary widget with caller-owned geometry', () => {
  const widget = floatingWindow({
    id: 'window',
    title: 'Window',
    body: text('Floating'),
    row: 2,
    column: 4,
    width: 34,
    height: 8,
    closeMessage: { kind: 'close' }
  });
  const output = plain(widget);

  assert.equal(widget.kind, 'absolute');
  assert.match(output, /Window/u);
  assert.match(output, /Floating/u);
  assert.match(output, /Close/u);
});

test('windowReducer moves resizes and clamps caller-owned geometry', () => {
  const initial = { row: 4, column: 6, width: 24, height: 8 };
  const moved = windowReducer(initial, { type: 'moveBy', rows: 10, columns: 20 }, {
    viewport: { columns: 40, rows: 20 }
  });
  const resized = windowReducer(moved, { type: 'resizeBy', rows: 20, columns: 50 }, {
    minWidth: 10,
    minHeight: 5,
    viewport: { columns: 40, rows: 20 }
  });
  const pinned = windowReducer(resized, { type: 'moveTo', row: -5, column: 99 }, {
    viewport: { columns: 40, rows: 20 }
  });

  assert.deepEqual(moved, { row: 12, column: 16, width: 24, height: 8 });
  assert.deepEqual(resized, { row: 0, column: 0, width: 40, height: 20 });
  assert.deepEqual(pinned, { row: 0, column: 0, width: 40, height: 20 });
});
