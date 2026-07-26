import assert from 'node:assert/strict';
import test from 'node:test';
import { createFrameBuffer, drawBorder, layoutElement, renderElementFrame, renderFramePlain } from '../../dist/renderer/index.js';
import { renderElementRegions } from '../../dist/renderer/internal/render.js';
import { defaultTheme, noColorTheme } from '../../dist/theme/index.js';
import { button, dialog, text } from '../../dist/components/index.js';
import { row, surface } from '../../dist/layout/index.js';

test('dialog centers a bounded dialog and lays out child content inside the border', () => {
  const element = dialog(text('inside', { id: 'inside' }), {
    id: 'dialog',
    title: 'Confirm',
    modal: true,
    focusPolicy: { returnFocus: 'restore' },
    width: 12,
    height: 5
  });
  const layout = layoutElement(element, { columns: 30, rows: 9 });

  assert.deepEqual(layout.children[0]?.bounds, { row: 4, column: 11, width: 10, height: 3 });
  const frame = renderElementFrame(element, { columns: 30, rows: 9 });
  const rendered = frame.cells.map((cell) => cell.text).join('');
  assert.equal(frame.accessibility.root.label, 'Confirm');
  assert.match(rendered, /inside/u);
});

test('surface authoring rejects unknown appearances', () => {
  assert.throws(
    () => surface(text('content'), { appearance: 'floating' }),
    TypeError
  );
});

test('dialog accessibility label derives from structured authored titles', () => {
  const spanTitleFrame = renderElementFrame(dialog(text('inside', { id: 'inside' }), {
    id: 'span-dialog',
    modal: true,
    focusPolicy: { returnFocus: 'restore' },
    title: [{ kind: 'text', text: 'Span' }, { kind: 'text', text: ' title' }],
    border: { kind: 'single' },
    width: 18,
    height: 5
  }), { columns: 30, rows: 9 });
  const slottedTitleFrame = renderElementFrame(dialog(text('inside', { id: 'inside' }), {
    id: 'slotted-dialog',
    modal: true,
    focusPolicy: { returnFocus: 'restore' },
    title: {
      start: [{ kind: 'text', text: 'Start' }],
      center: 'Center',
      end: [{ kind: 'text', text: 'End' }]
    },
    border: { kind: 'single' },
    width: 26,
    height: 5
  }), { columns: 34, rows: 9 });

  assert.equal(spanTitleFrame.accessibility.root.label, 'Span title');
  assert.equal(slottedTitleFrame.accessibility.root.label, 'Start Center End');
});

test('dialog reserves a structurally separated action area without color', () => {
  const element = dialog(text('Dialog body', { id: 'body' }), {
    id: 'dialog',
    title: 'Confirm',
    modal: true,
    focusPolicy: { returnFocus: 'restore' },
    width: 20,
    height: 7,
    actions: row([
      button({ id: 'cancel', label: 'Cancel' }),
      button({ id: 'confirm', label: 'OK' })
    ], { gap: 1 })
  });
  const layout = layoutElement(element, { columns: 30, rows: 9 }, noColorTheme);

  assert.deepEqual(layout.children[0]?.bounds, { row: 3, column: 7, width: 18, height: 3 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 7, column: 7, width: 18, height: 1 });

  const frame = renderElementFrame(element, { columns: 30, rows: 9 }, { theme: noColorTheme });
  const separatorCells = frame.cells.filter((cell) => cell.source?.elementKind === 'dialog' && cell.source.description === 'action-separator');

  assert.equal(separatorCells.length, 18);
  assert.deepEqual([...new Set(separatorCells.map((cell) => cell.text))], ['-']);
  assert.match(renderFramePlain(frame), /Dialog body/u);
  assert.match(renderFramePlain(frame), /Cancel/u);
  assert.match(renderFramePlain(frame), /OK/u);
});

test('dialog action separators preserve one-cell geometry under ambiguous-wide profiles', () => {
  const frame = renderElementFrame(dialog(text('Body'), {
    id: 'wide-dialog',
    title: 'Confirm',
    width: 16,
    height: 7,
    actions: button({ id: 'confirm', label: 'OK' })
  }), { columns: 24, rows: 9 }, {
    widthProfile: { emoji: 'wide', ambiguous: 'wide' }
  });
  const separators = frame.cells.filter((cell) => cell.source?.description === 'action-separator');

  assert.equal(separators.length, 14);
  assert.ok(separators.every((cell) => cell.text === '-' && cell.width === 1));
});

test('dialog exposes outside-press dismissal only outside its painted bounds', () => {
  const element = dialog(text('Dialog body', { id: 'body' }), {
    id: 'dismissible-dialog',
    title: 'Dismissible',
    modal: true,
    focusPolicy: { returnFocus: 'restore' },
    dismissal: {
      escape: false,
      outsidePress: true,
      onDismiss: (reason) => ({ kind: 'dismiss', reason })
    },
    width: 12,
    height: 5
  });
  const targets = renderElementRegions(element, { columns: 30, rows: 9 }).flatMap((region) => region.hitTargets);
  const dialogRect = { row: 3, column: 10, width: 12, height: 5 };
  const outside = targets.filter((target) => target.id.startsWith('dismissible-dialog:outside:'));

  assert.equal(outside.length, 4);
  assert.equal(outside.every((target) => !rectanglesOverlap(target.bounds, dialogRect)), true);
  assert.deepEqual(outside[0]?.message({
    kind: 'click',
    row: outside[0].bounds.row,
    column: outside[0].bounds.column,
    button: 'left'
  }), { kind: 'dismiss', reason: 'outsidePress' });
});

test('border model supports styled element borders and borderless layout', () => {
  const doubleFrame = renderElementFrame(surface(text('inside', { id: 'inside' }), {
    id: 'panel',
    title: 'Panel',
    border: { kind: 'double' }
  }), { columns: 14, rows: 4 });
  const doubleOutput = renderFramePlain(doubleFrame);

  assert.match(doubleOutput, /╔ Panel/u);
  assert.match(doubleOutput, /╗/u);
  assert.match(doubleOutput, /║/u);
  assert.match(doubleOutput, /╚/u);

  const borderless = surface(text('flush', { id: 'flush' }), {
    id: 'plain',
    border: { kind: 'none' }
  });
  const borderlessLayout = layoutElement(borderless, { columns: 8, rows: 2 });
  const borderlessFrame = renderElementFrame(borderless, { columns: 8, rows: 2 });

  assert.deepEqual(borderlessLayout.children[0]?.bounds, { row: 1, column: 1, width: 8, height: 2 });
  assert.equal(renderFramePlain(borderlessFrame), 'flush');
});

test('surface bar appearance renders one-line bars without borders', () => {
  const frame = renderElementFrame(surface(text('Menu', { id: 'menu-label' }), {
    id: 'app-bar',
    appearance: 'bar',
    padding: { left: 1, right: 1 }
  }), { columns: 10, rows: 1 });
  const output = renderFramePlain(frame);
  const background = frame.cells.find((cell) =>
    cell.source?.elementKind === 'surface'
    && cell.source.partName === 'background'
    && cell.style?.bg?.kind === 'theme'
  );

  assert.equal(output, ' Menu');
  assert.equal(background?.style?.bg?.token, 'surface.bar.background');
  assert.equal(frame.cells.some((cell) => cell.source?.cellRole === 'border'), false);
});

test('surface borders degrade in tiny regions to preserve child content', () => {
  const element = surface(text('Menu', { id: 'menu-label' }), {
    id: 'tiny-raised',
    appearance: 'raised'
  });
  const layout = layoutElement(element, { columns: 10, rows: 1 });
  const frame = renderElementFrame(element, { columns: 10, rows: 1 });

  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 10, height: 1 });
  assert.equal(renderFramePlain(frame), 'Menu');
  assert.equal(frame.cells.some((cell) => cell.source?.cellRole === 'border'), false);
});

test('shared border renderer clips titles and supports tiny ascii borders', () => {
  const buffer = createFrameBuffer(8, 3);
  drawBorder(buffer, { row: 1, column: 1, width: 8, height: 3 }, {
    kind: 'ascii',
    title: 'Very long title'
  });
  const frame = buffer.snapshot();

  assert.equal(renderFramePlain(frame).split('\n')[0], '+ Very +');

  const tiny = createFrameBuffer(1, 1);
  drawBorder(tiny, { row: 1, column: 1, width: 1, height: 1 }, { kind: 'heavy' });

  assert.equal(renderFramePlain(tiny.snapshot()), '┏');
});

test('shared border renderer aligns titles and clips wide unicode safely', () => {
  const centered = createFrameBuffer(12, 1);
  drawBorder(centered, { row: 1, column: 1, width: 12, height: 1 }, {
    kind: 'single',
    title: 'Hi',
    titleAlign: 'center'
  }, defaultTheme);
  const ended = createFrameBuffer(12, 1);
  drawBorder(ended, { row: 1, column: 1, width: 12, height: 1 }, {
    kind: 'single',
    title: 'Hi',
    titleAlign: 'end'
  }, defaultTheme);
  const wide = createFrameBuffer(6, 1);
  drawBorder(wide, { row: 1, column: 1, width: 6, height: 1 }, {
    kind: 'rounded',
    title: '界界界',
    titleAlign: 'center'
  }, defaultTheme);

  assert.equal(renderFramePlain(centered.snapshot()), '┌─── Hi ───┐');
  assert.equal(renderFramePlain(ended.snapshot()), '┌────── Hi ┐');
  assert.equal(renderFramePlain(wide.snapshot()), '╭ 界─╮');
});

function rectanglesOverlap(left, right) {
  return left.column < right.column + right.width
    && left.column + left.width > right.column
    && left.row < right.row + right.height
    && left.row + left.height > right.row;
}
