import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defineTui,
  runTui
} from '../../dist/tui/index.js';
import {
  createTerminalHarness } from '../../dist/testing/index.js';
import {
  diffFrames,
  layoutElement,
  renderDiffAnsi,
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  row,
  column,
  surface
} from '../../dist/layout/index.js';
import {
  statusBar,
  text,
  textInput
} from '../../dist/components/index.js';

function dashboardWidget(state) {
  return surface(
    column([
      text('Terminal workbench', { id: 'title' }),
      row([
        text('Left pane', { id: 'left-pane' }),
        textInput({
          id: 'action-field',
          presentation: { value: state.submitted ? 'Submitted' : 'Press enter', cursor: 0 },
          onSubmit: { type: 'submit' }
        })
      ], { id: 'panes' }),
      statusBar({
        id: 'status',
        leading: [{
          id: 'submission',
          kind: 'status',
          text: state.submitted ? 'Status: done' : 'Status: waiting',
          status: state.submitted ? 'success' : 'pending'
        }]
      })
    ], { id: 'body' }),
    { id: 'root-surface', border: { kind: 'single' } }
  );
}

test('vertical TUI slice turns widget tree into layout, frame, diff, and runtime memory evidence', async () => {
  const initialWidget = dashboardWidget({ submitted: false });

  const viewport = { columns: 30, rows: 6 };
  const layout = layoutElement(initialWidget, viewport);
  assert.equal(layout.kind, 'surface');
  assert.equal(layout.id, 'root-surface');
  assert.deepEqual(layout.bounds, { row: 1, column: 1, width: 30, height: 6 });
  assert.equal(layout.children[0]?.kind, 'column');
  assert.equal(layout.children[0]?.children[1]?.kind, 'row');
  assert.equal(layout.children[0]?.children[1]?.children[1]?.id, 'action-field');

  const frame = renderElementFrame(initialWidget, viewport);
  assert.equal(frame.schemaVersion, 'terminal-ui.tui-frame.v1');
  assert.equal(frame.width, 30);
  assert.equal(frame.height, 6);
  assert.equal(frame.accessibility.source, 'tui');
  assert.equal(frame.accessibility.root.id, 'root-surface');
  assert.ok(frame.focusPath?.includes('action-field'));

  const rendered = renderFramePlain(frame);
  assert.match(rendered, /Terminal workbench/u);
  assert.match(rendered, /Left pane/u);
  assert.match(rendered, /Press en…/u);

  const submittedFrame = renderElementFrame(dashboardWidget({ submitted: true }), viewport, {
    focusPath: frame.focusPath
  });
  const diff = diffFrames(frame, submittedFrame);
  assert.equal(diff.schemaVersion, 'terminal-ui.render-diff.v1');
  assert.equal(diff.fullRewrite, false);
  assert.ok(diff.operations.every((operation) => operation.kind !== 'clearLine'));
  assert.ok(diff.operations.some((operation) =>
    operation.kind === 'write'
    && operation.spans.some((span) => span.text === '   ')
  ));
  const submittedWrite = diff.operations.find((operation) =>
    operation.kind === 'write'
    && operation.spans.map((span) => span.text).join('').includes('Submitted')
  );
  assert.equal(submittedWrite?.kind, 'write');
  assert.equal(submittedWrite?.spans[0]?.style?.inverse, true);
  assert.equal(submittedWrite?.spans[0]?.source?.ownerId, 'action-field');
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
  assert.equal(harness.snapshot().root.id, 'root-surface');
  assert.equal(harness.transcript.snapshot().steps.filter((step) => step.kind === 'frame').length, 2);
  assert.equal(harness.transcript.snapshot().steps.filter((step) => step.kind === 'diff').length, 2);
  assert.equal(harness.transcript.snapshot().steps.filter((step) => step.kind === 'restore').length, 1);
  assert.match(harness.output(), /Terminal workbench/u);
  assert.match(renderFramePlain(harness.frames()[1]), /Submitted/u);
  assert.equal(exit.snapshot.root.id, 'root-surface');
  assert.equal(harness.host.stdin.isRawModeEnabled(), false);
});
