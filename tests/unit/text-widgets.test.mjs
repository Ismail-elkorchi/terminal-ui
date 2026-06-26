import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFrame, renderWidgetFrame } from '../../dist/tui/index.js';
import { activityIndicator, helpBar, richText, textArea } from '../../dist/widgets/index.js';

test('richText renders sanitized styled segments as plain frame text', () => {
  const frame = renderWidgetFrame(richText({
    id: 'rich',
    segments: [
      { text: 'Build ', tone: 'muted' },
      { text: '\u001B[31mfailed\u001B[0m', tone: 'error', emphasis: 'bold' }
    ]
  }), { columns: 24, rows: 2 });

  assert.equal(renderFrame(frame), 'Build failed');
  assert.equal(frame.accessibility.root.value, 'Build failed');
});

test('textArea renders multiline windows and exposes cursor/accessibility state', () => {
  const frame = renderWidgetFrame(textArea({
    id: 'body',
    value: 'line one\nline two',
    cursor: 'line one\nline'.length,
    selection: { start: 0, end: 4 }
  }), { columns: 20, rows: 3 });

  assert.equal(renderFrame(frame), 'line one\nline two');
  assert.deepEqual(frame.cursor, { row: 2, column: 5 });
  assert.equal(frame.accessibility.root.role, 'textbox');
  assert.equal(frame.accessibility.root.description, '2 lines. Selection active.');
});

test('helpBar and activityIndicator provide reusable app chrome', () => {
  const helpFrame = renderWidgetFrame(helpBar({
    id: 'help',
    bindings: [
      { key: 'Enter', label: 'open' },
      { key: 'Esc', label: 'close' }
    ]
  }), { columns: 32, rows: 1 });
  const activityFrame = renderWidgetFrame(activityIndicator({
    id: 'activity',
    label: 'Indexing',
    status: 'running'
  }), { columns: 32, rows: 1 });

  assert.equal(renderFrame(helpFrame), 'Enter open  Esc close');
  assert.equal(helpFrame.accessibility.root.role, 'status');
  assert.equal(renderFrame(activityFrame), '... Indexing (running)');
  assert.equal(activityFrame.accessibility.root.value, '... Indexing (running)');
});
