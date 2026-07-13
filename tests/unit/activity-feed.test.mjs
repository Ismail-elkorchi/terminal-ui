import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveTerminalCapabilities } from '../../dist/host/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import { highContrastTheme } from '../../dist/theme/index.js';
import {
  renderElementFrame,
  renderElementRegions,
  renderFramePlain
} from '../../dist/renderer/index.js';
import {
  activityFeed,
  structuredBlock
} from '../../dist/components/index.js';
import {
  activityFeedPresentation,
  activityFeedReducer,
  visibleActivityFeedBlocks
} from '../../dist/behavior/index.js';

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
  const collapsed = renderElementFrame(structuredBlock(blocks[0]), { columns: 32, rows: 6 });
  const expanded = renderElementFrame(structuredBlock(blocks[1]), { columns: 32, rows: 8 });

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
  const frame = renderElementFrame(structuredBlock({
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
    const frame = renderElementFrame(structuredBlock({
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
  const frame = renderElementFrame(structuredBlock({
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

test('structuredBlock middle-clips compact summaries and fields', () => {
  const frame = renderElementFrame(structuredBlock({
    id: 'path-card',
    title: 'Selected file',
    summary: '/home/ismail-el-korchi/Documents/Projects/terminal-ui/src/accessibility/snapshot.ts',
    fields: [
      { label: 'path', value: '/home/ismail-el-korchi/Documents/Projects/terminal-ui/src/accessibility/snapshot.ts' }
    ],
    body: 'body text still wraps normally'
  }), { columns: 34, rows: 6 });

  assert.equal(
    renderFramePlain(frame),
    '[-] Selected file\n/home/ismail-el-k…lity/snapshot.ts\npath: /home/ismai…lity/snapshot.ts\nbody text still wraps normally'
  );
});

test('activityFeed renders selected visible blocks and accessible options', () => {
  const frame = renderElementFrame(activityFeed({
    id: 'feed',
    blocks,
    selectedId: 'running'
  }), { columns: 36, rows: 10 });
  const output = renderFramePlain(frame);

  assert.match(output, /› \[-\] \[running\] Running task/u);
  assert.match(output, /Streaming output/u);
  assert.match(output, /Details: extra diagnostics/u);
  assert.equal(frame.accessibility.root.role, 'listbox');
  assert.equal(frame.accessibility.root.description, 'Showing 1-3 of 3 activity blocks.');
  assert.equal(frame.cells.find((cell) => cell.text === '›')?.style?.bg?.kind, 'theme');
  assert.equal(frame.cells.find((cell) => cell.text === '›')?.source?.label, 'selection.selected');
  assert.equal(frame.cells.find((cell) => cell.text === 'R')?.source?.ownerKind, 'activityFeed');
  assert.equal(frame.cells.find((cell) => cell.text === 'R')?.source?.label, 'title');
  assert.equal(frame.cells.find((cell) => cell.text === 'R')?.source?.itemId, 'running');
  assert.equal(frame.cells.find((cell) => cell.text === 'R')?.source?.state, 'selected');
  assert.equal(frame.cells.find((cell) => cell.text === 'R')?.style?.bg?.token, 'selection.background');
  assert.deepEqual(frame.accessibility.root.children?.map((node) => [node.id, node.selected]), [
    ['feed:block:queued', false],
    ['feed:block:running', true],
    ['feed:block:done', false]
  ]);
});

test('activityFeed exposes block hit targets and keyboard focus when interactive', () => {
  const element = activityFeed({
    id: 'interactive-feed',
    blocks,
    selectedId: 'running',
    onAction: (action) => ({ kind: 'activity', action }),
    keys: { arrowDown: () => ({ kind: 'next' }) }
  });
  const viewport = { columns: 36, rows: 10 };
  const frame = renderElementFrame(element, viewport);
  const routedTargets = renderElementRegions(element, viewport).flatMap((region) => region.hitTargets);

  assert.deepEqual(frame.hitTargets?.map((target) => [target.id, target.bounds.height]), [
    ['interactive-feed:block:queued', 3],
    ['interactive-feed:block:running', 6],
    ['interactive-feed:block:done', 1]
  ]);
  assert.deepEqual(frame.focusPath, ['interactive-feed']);
  assert.deepEqual(routedTargets[1]?.message({}), {
    kind: 'activity',
    action: { kind: 'select', id: 'running' }
  });
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
    selectedId: 'collapsed',
    expandedIds: [],
    collapsedIds: []
  }, { kind: 'expandBlock', id: 'collapsed' }, { blocks: reducerBlocks });
  const visibleBlocks = visibleActivityFeedBlocks(reducerBlocks, state).map((entry) => entry.block);
  const frame = renderElementFrame(activityFeed({
    id: 'feed-from-state',
    blocks: visibleBlocks,
    selectedId: state.selectedId
  }), { columns: 40, rows: 6 });

  assert.match(renderFramePlain(frame), /body from reducer/u);
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'toggle.expanded' && cell.text === '-')?.text, '-');
  assert.equal(reducerBlocks[0]?.collapsed, true);
});

test('activityFeed toggle uses the block effective collapsed state', () => {
  const collapsed = [{ id: 'collapsed', title: 'Collapsed', collapsed: true }];
  const expanded = activityFeedReducer({
    selectedId: 'collapsed',
    expandedIds: [],
    collapsedIds: []
  }, { kind: 'toggleBlock' }, { blocks: collapsed });
  const restored = activityFeedReducer(expanded, { kind: 'toggleBlock' }, { blocks: collapsed });

  assert.deepEqual(expanded.expandedIds, ['collapsed']);
  assert.deepEqual(expanded.collapsedIds, []);
  assert.deepEqual(restored.expandedIds, []);
  assert.deepEqual(restored.collapsedIds, ['collapsed']);
});

test('structuredBlock and activityFeed preserve document state in high contrast and no color output', () => {
  const blockFrame = renderElementFrame(structuredBlock({
    id: 'error-record',
    title: 'Import',
    status: 'error',
    summary: 'Needs attention',
    fields: [{ label: 'owner', value: 'scheduler' }],
    body: 'Line one',
    details: 'Trace id 42'
  }), { columns: 44, rows: 8 }, { theme: highContrastTheme });
  const feedFrame = renderElementFrame(activityFeed({
    id: 'state-feed',
    blocks,
    selectedId: 'running'
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
  const frame = renderElementFrame(activityFeed({
    id: 'large-feed',
    blocks: manyBlocks,
    selectedId: 'block-990'
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

test('activityFeedPresentation preserves stable selection across reordered blocks', () => {
  const reordered = [blocks[2], blocks[0], blocks[1]];
  const projection = activityFeedPresentation(reordered, {
    selectedId: 'done',
    expandedIds: [],
    collapsedIds: []
  });

  assert.equal(projection.blocks.length, 3);
  assert.equal(projection.blocks[0]?.id, 'done');
  assert.equal(projection.selectedId, 'done');
});

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
