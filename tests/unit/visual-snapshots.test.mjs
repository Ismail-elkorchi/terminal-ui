import assert from 'node:assert/strict';
import test from 'node:test';

import { createVisualSnapshot } from '../../dist/testing/index.js';
import { renderWidgetFrame } from '../../dist/tui/index.js';
import { button, richText, text } from '../../dist/widgets/index.js';

test('visual snapshots produce deterministic plain ANSI frame accessibility diff hit and focus artifacts', () => {
  const frame = renderWidgetFrame(button({
    id: 'run',
    label: 'Run',
    message: { kind: 'run' }
  }), { columns: 12, rows: 2 });

  const first = createVisualSnapshot({ frame, previousFrame: frame });
  const second = createVisualSnapshot({ frame, previousFrame: frame });

  assert.deepEqual(second, first);
  assert.equal(first.schemaVersion, 'terminal-ui.visual-snapshots.v1');
  assert.equal(first.plainTextFrame, '[ Run ]');
  assert.match(first.ansiFrame, /\\x1b\[1;1H/u);
  assert.doesNotMatch(first.ansiFrame, /\u001B/u);
  assert.match(first.frameJson, /"schemaVersion": "terminal-ui.tui-frame.v1"/u);
  assert.match(first.accessibilityJson, /"role": "button"/u);
  assert.match(first.diffJson, /"schemaVersion": "terminal-ui.render-diff.v1"/u);
  assert.match(first.diffJson, /"kind": "moveCursor"/u);
  assert.match(first.hitTargetJson, /"id": "run:control"/u);
  assert.match(first.focusTargetJson, /"focusPath"/u);
  assert.match(first.focusTargetJson, /"run"/u);
});

test('visual snapshots fail on uncontrolled style changes through structured frame JSON', () => {
  const base = renderWidgetFrame(richText({
    id: 'style',
    segments: [{ text: 'Styled', style: { fg: { kind: 'theme', token: 'accent.primary' } } }]
  }), { columns: 12, rows: 1 });
  const changed = renderWidgetFrame(richText({
    id: 'style',
    segments: [{ text: 'Styled', style: { fg: { kind: 'theme', token: 'status.error' } } }]
  }), { columns: 12, rows: 1 });

  assert.notEqual(createVisualSnapshot({ frame: base }).frameJson, createVisualSnapshot({ frame: changed }).frameJson);
});

test('visual snapshots preserve wide Unicode deterministically and keep raw control sequences out of plain artifacts', () => {
  const frame = renderWidgetFrame(text('A界🙂é \u001B[31mred'), { columns: 16, rows: 2 });
  const snapshot = createVisualSnapshot({ frame });

  assert.match(snapshot.plainTextFrame, /A界🙂é red/u);
  assert.doesNotMatch(snapshot.plainTextFrame, /\u001B/u);
  assert.doesNotMatch(snapshot.frameJson, /\u001B/u);
  assert.match(snapshot.frameJson, /"text": "界"/u);
});
