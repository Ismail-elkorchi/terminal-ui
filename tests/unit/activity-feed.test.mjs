import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import { activityFeed, structuredBlock } from '../../dist/widgets/index.js';

const blocks = [
  {
    id: 'queued',
    title: 'Queued task',
    summary: 'Waiting for a worker',
    status: 'pending',
    fields: [{ label: 'owner', value: 'scheduler' }],
    collapsed: true
  },
  {
    id: 'running',
    title: 'Running task',
    summary: 'Streaming output',
    status: 'running',
    fields: [{ label: 'attempt', value: '2' }],
    body: 'line one\nline two',
    details: 'extra diagnostics'
  },
  {
    id: 'done',
    title: 'Completed task',
    summary: 'Finished cleanly',
    status: 'success',
    collapsed: true
  }
];

test('structuredBlock renders collapsed and expanded block data', () => {
  const collapsed = renderWidgetFrame(structuredBlock(blocks[0]), { columns: 32, rows: 6 });
  const expanded = renderWidgetFrame(structuredBlock(blocks[1]), { columns: 32, rows: 8 });

  assert.equal(renderFramePlain(collapsed), '[+] [pending] Queued task\nWaiting for a worker\nowner: scheduler');
  assert.equal(
    renderFramePlain(expanded),
    '[-] [running] Running task\nStreaming output\nattempt: 2\nline one\nline two\nDetails: extra diagnostics'
  );
  assert.equal(collapsed.accessibility.root.description, 'status pending, collapsed, 1 fields');
  assert.equal(expanded.accessibility.root.description, 'status running, expanded, 1 fields');
  assert.deepEqual(collapsed.accessibility.root.children?.map((node) => [node.id, node.value]), [
    ['queued:status', 'pending'],
    ['queued:summary', 'Waiting for a worker'],
    ['queued:field:owner', 'scheduler']
  ]);
});

test('structuredBlock sanitizes terminal control sequences', () => {
  const frame = renderWidgetFrame(structuredBlock({
    id: 'unsafe',
    title: 'Title \u001B[31mred\u001B[0m',
    body: 'Body \u001B[32mgreen\u001B[0m'
  }), { columns: 40, rows: 4 });

  assert.equal(renderFramePlain(frame), '[-] Title red\nBody green');
  assert.equal(frame.accessibility.root.label, 'Title red');
});

test('structuredBlock supports required status states with themed status cells', () => {
  const statuses = ['pending', 'running', 'success', 'warning', 'error', 'failed', 'cancelled', 'skipped', 'info'];
  for (const status of statuses) {
    const frame = renderWidgetFrame(structuredBlock({
      id: `status-${status}`,
      title: `Status ${status}`,
      status
    }), { columns: 40, rows: 2 });
    const statusCell = frame.cells.find((cell) => cell.text === status[0]);

    assert.match(renderFramePlain(frame), new RegExp(`\\[${status}\\] Status ${status}`, 'u'));
    assert.equal(statusCell?.style?.bold, true);
    assert.equal(statusCell?.style?.fg?.kind, 'theme');
  }
});

test('structuredBlock aligns fields and wraps long body text predictably', () => {
  const frame = renderWidgetFrame(structuredBlock({
    id: 'details',
    title: 'Details',
    fields: [
      { label: 'short', value: 'one' },
      { label: 'longer-label', value: 'two' }
    ],
    body: 'abcdefghijklmnopqrst'
  }), { columns: 18, rows: 8 });

  assert.equal(
    renderFramePlain(frame),
    '[-] Details\nshort       : one\nlonger-label: two\nabcdefghijklmnopqr\nst'
  );
});

test('activityFeed renders selected visible blocks and accessible options', () => {
  const frame = renderWidgetFrame(activityFeed({
    id: 'feed',
    blocks,
    selected: 1
  }), { columns: 36, rows: 10 });
  const output = renderFramePlain(frame);

  assert.match(output, /› \[-\] \[running\] Running task/u);
  assert.match(output, /Streaming output/u);
  assert.match(output, /Details: extra diagnostics/u);
  assert.equal(frame.accessibility.root.role, 'listbox');
  assert.equal(frame.accessibility.root.description, 'Showing 1-3 of 3 activity blocks.');
  assert.equal(frame.cells.find((cell) => cell.text === '›')?.style?.bg?.kind, 'theme');
  assert.deepEqual(frame.accessibility.root.children?.map((node) => [node.id, node.selected]), [
    ['feed:block:queued', false],
    ['feed:block:running', true],
    ['feed:block:done', false]
  ]);
});

test('activityFeed bounds rendered rows to the viewport', () => {
  const manyBlocks = Array.from({ length: 1000 }, (_value, index) => ({
    id: `block-${index}`,
    title: `Block ${index}`,
    status: 'running',
    collapsed: true
  }));
  const frame = renderWidgetFrame(activityFeed({
    id: 'large-feed',
    blocks: manyBlocks,
    selected: 990
  }), { columns: 32, rows: 5 });
  const output = renderFramePlain(frame);

  assert.match(output, /Block 990/u);
  assert.doesNotMatch(output, /Block 0/u);
  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal(frame.accessibility.root.children?.length, 5);
});
