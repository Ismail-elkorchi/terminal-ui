import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAccessibleSnapshot } from '../../dist/accessibility/index.js';
import { diffFrames, renderDiffAnsi, renderElementFrame, renderFrameDebug, renderFramePlain } from '../../dist/renderer/index.js';
import { list, progressBar, spinner, statusBar, table, text, textInput } from '../../dist/components/index.js';
import { column, row, viewport } from '../../dist/layout/index.js';

test('renderFrameDebug emits cursor-addressed control-sequence output', () => {
  const frame = renderElementFrame(textInput({ id: 'addressed-field', presentation: { value: 'Go', cursor: 0 } }), { columns: 8, rows: 2 });
  const output = renderFrameDebug(frame);

  assert.match(output, /^\u001B\[H›/u);
  assert.match(output, /\u001B\[1;3HG/u);
  assert.match(output, /\u001B\[1;4Ho/u);
  assert.match(output, new RegExp(`\\u001B\\[${String(frame.cursor?.row)};${String(frame.cursor?.column)}H$`, 'u'));
  assert.equal(renderFramePlain(frame), '› Go');
});

test('TUI frame rendering positions wide graphemes by terminal cells', () => {
  const frame = renderElementFrame(text('A🙂B', { id: 'wide-text' }), { columns: 8, rows: 2 });
  const output = renderFramePlain(frame);
  const addressed = renderFrameDebug(frame);

  assert.equal(output, 'A🙂B');
  assert.deepEqual(frame.cells.slice(0, 4).map((cell) => [cell.column, cell.text, cell.width, cell.continuation === true]), [
    [1, 'A', 1, false],
    [2, '🙂', 2, false],
    [3, '', 0, true],
    [4, 'B', 1, false]
  ]);
  assert.match(addressed, /\u001B\[1;2H🙂/u);
  assert.match(addressed, /\u001B\[1;4HB/u);
});

test('one width profile governs nested buffers and incompatible profiles force a full redraw', () => {
  const element = viewport(text('·🙂x', { id: 'profile-text' }), {
    id: 'profile-viewport',
    contentRows: 1,
    contentColumns: 8
  });
  const narrow = renderElementFrame(element, { columns: 8, rows: 1 }, {
    widthProfile: { ambiguous: 'narrow', emoji: 'wide' }
  });
  const wide = renderElementFrame(element, { columns: 8, rows: 1 }, {
    widthProfile: { ambiguous: 'wide', emoji: 'wide' }
  });

  assert.deepEqual(narrow.widthProfile, { ambiguous: 'narrow', emoji: 'wide' });
  assert.deepEqual(wide.widthProfile, { ambiguous: 'wide', emoji: 'wide' });
  assert.deepEqual(
    narrow.cells.filter((cell) => cell.continuation !== true).map((cell) => [cell.column, cell.text, cell.width]),
    [[1, '·', 1], [2, '🙂', 2], [4, 'x', 1]]
  );
  assert.deepEqual(
    wide.cells.filter((cell) => cell.continuation !== true).map((cell) => [cell.column, cell.text, cell.width]),
    [[1, '·', 2], [3, '🙂', 2], [5, 'x', 1]]
  );
  assert.equal(diffFrames(narrow, wide).fullRewrite, true);
});

test('TUI frame cursor follows the selected visible list item', () => {
  const items = Array.from({ length: 10 }, (_value, index) => `Item ${index}`);
  const frame = renderElementFrame(list({
    id: 'cursor-list',
    items,
    projectItem: (item) => ({ id: item, label: item }),
    selectedId: 'Item 6'
  }), { columns: 16, rows: 5 });
  const output = renderFramePlain(frame);
  const addressed = renderFrameDebug(frame);

  assert.deepEqual(frame.focusPath, ['cursor-list']);
  assert.deepEqual(frame.cursor, { row: 3, column: 1 });
  assert.match(output, /› Item 6/);
  assert.match(addressed, /\u001B\[3H$/u);
});

test('TUI status, progress, and spinner components render accessible status state', () => {
  const frame = renderElementFrame(column([
    statusBar({ id: 'status', leading: [{ id: 'ready', kind: 'status', text: 'Ready', status: 'success' }] }),
    progressBar({ id: 'progress', label: 'Sync', mode: { kind: 'determinate', value: 150, max: 100 } }),
    progressBar({ id: 'pending', label: 'Waiting', mode: { kind: 'indeterminate' } }),
    spinner({ id: 'spinner', label: 'Working' })
  ]), { columns: 32, rows: 8 });
  const output = renderFramePlain(frame);
  const [statusNode, progressNode, pendingNode, spinnerNode] = frame.accessibility.root.children;

  assert.match(output, /Ready/);
  assert.match(output, /Sync ██████████ 100\/100/);
  assert.match(output, /Waiting ████░░░░░░/);
  assert.match(output, /⠋ Working/);
  assert.deepEqual([statusNode?.role, statusNode?.value], ['status', 'Ready']);
  assert.deepEqual([progressNode?.role, progressNode?.label, progressNode?.numericValue], [
    'progressbar',
    'Sync',
    { current: 100, minimum: 0, maximum: 100 }
  ]);
  assert.deepEqual([pendingNode?.role, pendingNode?.label, pendingNode?.numericValue], [
    'progressbar',
    'Waiting',
    { indeterminate: true }
  ]);
  assert.deepEqual([spinnerNode?.role, spinnerNode?.value], ['status', 'Working (running)']);
  assert.deepEqual([statusNode?.live, progressNode?.live, pendingNode?.live, spinnerNode?.live], ['polite', 'polite', 'polite', 'polite']);
  assert.equal(validateAccessibleSnapshot(frame.accessibility).ok, true);
});

test('renderDiffAnsi serializes clear, write, and structural cursor state', () => {
  const previous = renderElementFrame(text('Longer text', { id: 'before' }), { columns: 16, rows: 2 });
  const next = renderElementFrame(textInput({ id: 'after', presentation: { value: 'Go', cursor: 0 } }), { columns: 16, rows: 2 });
  const diff = diffFrames(previous, next);
  const output = renderDiffAnsi(diff);

  assert.ok(diff.operations.some((operation) => operation.kind === 'write'));
  assert.deepEqual(diff.cursor, next.cursor);
  assert.match(output, /\u001B\[H› Go/u);
  assert.doesNotMatch(output, /\u001B\[\?25[hl]/u);
});


test('TUI rendering windows large list and table components to visible height', () => {
  const manyItems = Array.from({ length: 1000 }, (_value, index) => `Item ${index}`);
  const frame = renderElementFrame(column([
    list({ id: 'many-items', items: manyItems, projectItem: (item) => ({ id: item, label: item }), selectedId: 'Item 990' }),
    table({ id: 'many-rows', rows: manyItems.map((item) => [item, 'value']), getRowId: (_row, index) => String(index) })
  ], {
    sizes: [{ kind: 'fill' }, { kind: 'fill' }]
  }), { columns: 24, rows: 8 });
  const output = renderFramePlain(frame);
  const listNode = frame.accessibility.root.children[0];
  const tableNode = frame.accessibility.root.children[1];

  assert.match(output, /Item 990/);
  assert.doesNotMatch(output, /Item 0\n Item 1\n Item 2\n Item 3\n Item 4\n Item 5\n Item 6\n Item 7\n Item 8/);
  assert.ok(frame.cells.length <= frame.width * frame.height);
  assert.equal(listNode?.children?.length, 4);
  assert.equal(tableNode?.children?.length, 4);
  assert.equal(listNode?.description, 'Showing 989-992 of 1000 items.');
  assert.equal(tableNode?.description, 'Showing 1-4 of 1000 rows.');
});

test('viewport layouts render a clipped scrolled window into child content', () => {
  const frame = renderElementFrame(viewport(
    text('row-0\nrow-1\nrow-2\nrow-3', { id: 'viewport-text' }),
    {
      id: 'viewport',
      scrollRow: 1,
      scrollColumn: 2,
      contentRows: 4,
      contentColumns: 8
    }
  ), { columns: 5, rows: 2 });
  const output = renderFramePlain(frame);
  const rightMarker = frame.cells.find((cell) => cell.source?.elementKind === 'viewport' && cell.source.description === 'clip-right');

  assert.equal(output, 'w-1 →\nw-2');
  assert.equal(rightMarker?.text, '→');
  assert.equal(
    frame.accessibility.root.description,
    'Showing rows 2-3 of 4, columns 3-7 of 8.'
  );
});

test('viewport layouts keep offscreen content from leaking into neighboring layout', () => {
  const frame = renderElementFrame(row([
    viewport(
      text('left-0\nleft-1\nleft-2', { id: 'left-content' }),
      { id: 'left-window', scrollRow: 2, contentRows: 3 }
    ),
    text('right', { id: 'right-content' })
  ]), { columns: 12, rows: 1 });
  const output = renderFramePlain(frame);

  assert.match(output, /^left-2right$/u);
  assert.doesNotMatch(output, /left-0|left-1/u);
});

test('viewport layouts expose empty virtual content without rendering child content', () => {
  const frame = renderElementFrame(viewport(
    text('hidden child', { id: 'empty-content' }),
    { id: 'empty-window', contentRows: 0, contentColumns: 8 }
  ), { columns: 5, rows: 3 });
  const output = renderFramePlain(frame);
  const emptyMarker = frame.cells.find((cell) => cell.source?.elementKind === 'viewport' && cell.source.description === 'empty');

  assert.doesNotMatch(output, /hidden child/u);
  assert.equal(emptyMarker?.text, '∅');
  assert.equal(frame.accessibility.root.description, 'Empty viewport content.');
});

test('viewport clipped-edge indicators do not overwrite visible content cells', () => {
  const frame = renderElementFrame(viewport(
    text('\n\n\n', { id: 'blank-content' }),
    {
      id: 'blank-window',
      scrollRow: 1,
      scrollColumn: 1,
      contentRows: 5,
      contentColumns: 5
    }
  ), { columns: 3, rows: 3 });
  const labels = new Set(frame.cells
    .map((cell) => cell.source?.description)
    .filter((label) => label !== undefined));

  assert.ok(labels.has('clip-top'));
  assert.ok(labels.has('clip-bottom'));
  assert.ok(labels.has('clip-left'));
  assert.ok(labels.has('clip-right'));
});

test('viewport edge indicators preserve fixed-cell geometry under ambiguous-wide profiles', () => {
  const frame = renderElementFrame(viewport(
    text('\n\n\n', { id: 'wide-blank-content' }),
    {
      id: 'wide-blank-window',
      scrollRow: 1,
      contentRows: 5,
      contentColumns: 3
    }
  ), { columns: 3, rows: 3 }, {
    widthProfile: { emoji: 'wide', ambiguous: 'wide' }
  });
  const top = frame.cells.find((cell) => cell.source?.description === 'clip-top');

  assert.equal(top?.text, '^');
  assert.equal(top?.width, 1);
});
