import assert from 'node:assert/strict';
import test from 'node:test';

import { createTerminalHarness } from '../../dist/testing/index.js';
import {
  defineTui,
  diffFrames,
  layoutWidget,
  renderDiffAnsi,
  renderFramePlain,
  renderWidgetFrame,
  runTui
} from '../../dist/tui/index.js';
import { box, inputField, row, stack, statusBar, text } from '../../dist/widgets/index.js';

function dashboardWidget(state) {
  return box(
    stack([
      text('Terminal workbench', { id: 'title' }),
      row([
        text('Left pane', { id: 'left-pane' }),
        inputField({
          id: 'action-field',
          value: state.submitted ? 'Submitted' : 'Press enter',
          message: { type: 'submit' }
        })
      ], { id: 'panes' }),
      statusBar({
        id: 'status',
        text: state.submitted ? 'Status: done' : 'Status: waiting'
      })
    ], { id: 'body' }),
    { id: 'root-box' }
  );
}

test('vertical TUI slice turns widget tree into layout, frame, diff, and runtime memory evidence', async () => {
  const initialWidget = dashboardWidget({ submitted: false });

  const viewport = { columns: 30, rows: 6 };
  const layout = layoutWidget(initialWidget, viewport);
  assert.equal(layout.kind, 'box');
  assert.equal(layout.id, 'root-box');
  assert.deepEqual(layout.bounds, { row: 1, column: 1, width: 30, height: 6 });
  assert.equal(layout.children[0]?.kind, 'stack');
  assert.equal(layout.children[0]?.children[1]?.kind, 'row');
  assert.equal(layout.children[0]?.children[1]?.children[1]?.id, 'action-field');

  const frame = renderWidgetFrame(initialWidget, viewport);
  assert.equal(frame.schemaVersion, 'terminal-ui.tui-frame.v1');
  assert.equal(frame.width, 30);
  assert.equal(frame.height, 6);
  assert.equal(frame.accessibility.source, 'tui');
  assert.equal(frame.accessibility.root.id, 'root-box');
  assert.ok(frame.focusPath?.includes('action-field'));

  const rendered = renderFramePlain(frame);
  assert.match(rendered, /Terminal workbench/u);
  assert.match(rendered, /Left pane/u);
  assert.match(rendered, /Press enter/u);

  const submittedFrame = renderWidgetFrame(dashboardWidget({ submitted: true }), viewport, {
    focusPath: frame.focusPath
  });
  const diff = diffFrames(frame, submittedFrame);
  assert.equal(diff.schemaVersion, 'terminal-ui.render-diff.v1');
  assert.equal(diff.fullRewrite, false);
  assert.ok(diff.operations.every((operation) => operation.kind !== 'clearLine'));
  assert.ok(diff.operations.some((operation) =>
    operation.kind === 'clearRect'
    && operation.bounds.row === 3
    && operation.bounds.column > 1
  ));
  assert.ok(diff.operations.some((operation) =>
    operation.kind === 'write'
    && operation.spans.some((span) => span.text.includes('Submitted'))
  ));
  assert.ok(renderDiffAnsi(diff).includes('\u001B['));

  const app = defineTui({
    id: 'vertical-slice-runtime',
    init: () => ({ submitted: false }),
    update: (_state, message) => ({
      state: { submitted: message.type === 'submit' },
      ...(message.type === 'submit' ? { exit: {} } : {})
    }),
    view: dashboardWidget
  });
  const harness = createTerminalHarness({ viewport });
  harness.host.input('\r');
  const exit = await runTui(app, harness.host);

  assert.equal(exit.status, 'completed');
  assert.deepEqual(exit.state, { submitted: true });
  assert.equal(harness.frames().length, 2);
  assert.equal(harness.diffs().length, 2);
  assert.deepEqual(harness.frames()[0], frame);
  assert.deepEqual(harness.frames()[1], submittedFrame);
  assert.equal(harness.diffs()[0].fullRewrite, true);
  assert.equal(harness.diffs()[1].fullRewrite, false);
  const { dirtyRegions, ...runtimeDiffPayload } = harness.diffs()[1];
  assert.deepEqual(runtimeDiffPayload, diff);
  assert.ok(dirtyRegions.length > 1);
  assert.equal(harness.restores().length, 1);
  assert.equal(harness.snapshot().source, 'tui');
  assert.equal(harness.snapshot().root.id, 'root-box');
  assert.equal(harness.transcript.snapshot().steps.filter((step) => step.kind === 'frame').length, 2);
  assert.equal(harness.transcript.snapshot().steps.filter((step) => step.kind === 'diff').length, 2);
  assert.equal(harness.transcript.snapshot().steps.filter((step) => step.kind === 'restore').length, 1);
  assert.match(harness.output(), /Terminal workbench/u);
  assert.match(harness.output(), /Submitted/u);
  assert.equal(exit.snapshot.root.id, 'root-box');
  assert.equal(harness.host.stdin.isRawModeEnabled(), false);
});
