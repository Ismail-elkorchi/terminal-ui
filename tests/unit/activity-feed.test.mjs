import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTerminalCapabilities } from '../../dist/host/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import { highContrastTheme } from '../../dist/theme/index.js';
import { renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import {
  activityFeed,
  activityFeedReducer,
  structuredBlock,
  visibleActivityFeedBlocks
} from '../../dist/widgets/index.js';

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
  assert.equal(collapsed.cells.find((cell) => cell.text === '+')?.source?.label, 'toggle.collapsed');
  assert.equal(collapsed.cells.find((cell) => cell.text === 'p')?.source?.label, 'status.pending');
  assert.equal(collapsed.cells.find((cell) => cell.text === 'Q')?.source?.label, 'title');
  assert.ok(collapsed.cells.some((cell) => cell.source?.label === 'field.owner.label' && cell.text === 'o'));
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
  assert.equal(frame.cells.find((cell) => cell.text === '›')?.source?.label, 'selection.selected');
  assert.equal(frame.cells.find((cell) => cell.text === 'R')?.source?.kind, 'activityFeed');
  assert.equal(frame.cells.find((cell) => cell.text === 'R')?.source?.label, 'title');
  assert.equal(frame.cells.find((cell) => cell.text === 'R')?.style?.bg?.token, 'selection.background');
  assert.deepEqual(frame.accessibility.root.children?.map((node) => [node.id, node.selected]), [
    ['feed:block:queued', false],
    ['feed:block:running', true],
    ['feed:block:done', false]
  ]);
});

test('activityFeed renders caller-owned reducer expansion state', () => {
  const reducerBlocks = [
    {
      id: 'collapsed',
      title: 'Collapsed',
      summary: 'Hidden body',
      status: 'pending',
      body: 'body from reducer',
      collapsed: true
    },
    {
      id: 'open',
      title: 'Open',
      status: 'success',
      body: 'already open'
    }
  ];
  const state = activityFeedReducer({
    selected: 0,
    expandedIds: [],
    collapsedIds: []
  }, { kind: 'expandBlock', id: 'collapsed' }, { blocks: reducerBlocks });
  const visibleBlocks = visibleActivityFeedBlocks(reducerBlocks, state).map((entry) => entry.block);
  const frame = renderWidgetFrame(activityFeed({
    id: 'feed-from-state',
    blocks: visibleBlocks,
    selected: state.selected
  }), { columns: 40, rows: 6 });

  assert.match(renderFramePlain(frame), /body from reducer/u);
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'toggle.expanded' && cell.text === '-')?.text, '-');
  assert.equal(reducerBlocks[0]?.collapsed, true);
});

test('structuredBlock and activityFeed preserve document state in high contrast and no color output', () => {
  const blockFrame = renderWidgetFrame(structuredBlock({
    id: 'error-record',
    title: 'Import',
    status: 'error',
    summary: 'Needs attention',
    fields: [{ label: 'owner', value: 'scheduler' }],
    body: 'Line one',
    details: 'Trace id 42'
  }), { columns: 44, rows: 8 }, { theme: highContrastTheme });
  const feedFrame = renderWidgetFrame(activityFeed({
    id: 'state-feed',
    blocks,
    selected: 1
  }), { columns: 44, rows: 8 }, { theme: highContrastTheme });
  const highContrast = createVisualSnapshot({
    frame: feedFrame,
    ansi: { capabilities: colorCapabilities(), theme: highContrastTheme }
  });
  const noColor = createVisualSnapshot({
    frame: feedFrame,
    ansi: { capabilities: noColorCapabilities(), theme: highContrastTheme }
  });

  assert.match(renderFramePlain(blockFrame), /\[-\] \[error\] Import/u);
  assert.match(renderFramePlain(blockFrame), /Details: Trace id 42/u);
  assert.equal(blockFrame.cells.find((cell) => cell.source?.label === 'status.error')?.style?.fg?.token, 'status.error');
  assert.equal(blockFrame.cells.find((cell) => cell.source?.label === 'details.label')?.source?.role, 'text');
  assert.equal(blockFrame.cells.find((cell) => cell.source?.label === 'field.owner.value')?.text, 's');
  assert.match(highContrast.plainTextFrame, /> \[-\] \[running\] Running task/u);
  assert.equal(noColor.plainTextFrame, highContrast.plainTextFrame);
  assert.doesNotMatch(noColor.ansiFrame, /\\x1b\[[0-9;]*m/u);
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
