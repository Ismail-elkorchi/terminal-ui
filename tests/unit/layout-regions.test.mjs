import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeScreen,
  screenStackReducer
} from '../../dist/behavior/index.js';
import {
  createFrameBuffer,
  drawBorder,
  gridCellRects,
  layoutElement,
  renderFramePlain,
  renderElementFrame,
  renderElementRegions,
  splitTracks
} from '../../dist/renderer/index.js';
import {
  defaultTheme,
  noColorTheme } from '../../dist/theme/index.js';
import {
  button,
  canvas,
  commandBar,
  contextMenu,
  dropdown,
  textInput,
  table,
  text
} from '../../dist/components/index.js';
import {
  grid,
  absolute,
  modal,
  overlay,
  row,
  splitPane,
  stack,
  tabs,
  surface
} from '../../dist/layout/index.js';

test('track helpers split fixed, percent, and fill regions deterministically', () => {
  assert.deepEqual(
    splitTracks(
      { row: 1, column: 1, width: 100, height: 10 },
      'horizontal',
      [{ kind: 'fixed', cells: 20 }, { kind: 'percent', value: 25 }, { kind: 'fill' }]
    ),
    [
      { row: 1, column: 1, width: 20, height: 10 },
      { row: 1, column: 21, width: 25, height: 10 },
      { row: 1, column: 46, width: 55, height: 10 }
    ]
  );

  assert.deepEqual(
    splitTracks(
      { row: 1, column: 1, width: 20, height: 5 },
      'horizontal',
      [{ kind: 'content', min: 4 }, { kind: 'fill' }],
      { margin: { left: 1, right: 1 }, padding: 1, gap: 2 }
    ),
    [
      { row: 2, column: 3, width: 4, height: 3 },
      { row: 2, column: 9, width: 10, height: 3 }
    ]
  );

  assert.deepEqual(
    gridCellRects(
      { row: 1, column: 1, width: 10, height: 4 },
      [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }],
      [{ kind: 'fixed', cells: 3 }, { kind: 'fill' }]
    ),
    [
      { row: 1, column: 1, width: 3, height: 1 },
      { row: 1, column: 4, width: 7, height: 1 },
      { row: 2, column: 1, width: 3, height: 3 },
      { row: 2, column: 4, width: 7, height: 3 }
    ]
  );

  assert.deepEqual(
    splitTracks(
      { row: 1, column: 1, width: 10, height: 1 },
      'horizontal',
      [{ kind: 'fixed', cells: 3 }, { kind: 'fixed', cells: 2 }],
      { gap: 1 }
    ),
    [
      { row: 1, column: 1, width: 3, height: 1 },
      { row: 1, column: 5, width: 2, height: 1 }
    ]
  );

  assert.deepEqual(
    splitTracks(
      { row: 1, column: 1, width: 7, height: 1 },
      'horizontal',
      [{ kind: 'fixed', cells: 2 }, { kind: 'fixed', cells: 2 }, { kind: 'fixed', cells: 2 }],
      { gap: 3 }
    ),
    [
      { row: 1, column: 1, width: 2, height: 1 },
      { row: 1, column: 4, width: 2, height: 1 },
      { row: 1, column: 6, width: 2, height: 1 }
    ]
  );
});

test('grid and splitPane widgets lay out common app frames', () => {
  const widget = grid([
    text('header', { id: 'header' }),
    splitPane([
      text('left', { id: 'left' }),
      text('main', { id: 'main' }),
      text('right', { id: 'right' })
    ], {
      id: 'body',
      direction: 'horizontal',
      sizes: [{ kind: 'fixed', cells: 10 }, { kind: 'fill' }, { kind: 'fixed', cells: 8 }]
    }),
    text('status', { id: 'status' }),
    commandBar({ id: 'command', value: '/help' })
  ], {
    id: 'workspace-frame',
    rows: [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }, { kind: 'fixed', cells: 1 }, { kind: 'fixed', cells: 1 }],
    columns: [{ kind: 'fill' }]
  });

  const layout = layoutElement(widget, { columns: 40, rows: 8 });
  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 40, height: 1 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 2, column: 1, width: 40, height: 5 });
  assert.deepEqual(layout.children[1]?.children[0]?.bounds, { row: 2, column: 1, width: 10, height: 5 });
  assert.deepEqual(layout.children[1]?.children[1]?.bounds, { row: 2, column: 11, width: 22, height: 5 });
  assert.deepEqual(layout.children[2]?.bounds, { row: 7, column: 1, width: 40, height: 1 });
  assert.deepEqual(layout.children[3]?.bounds, { row: 8, column: 1, width: 40, height: 1 });
});

test('splitPane content tracks use measured child width', () => {
  const widget = splitPane([
    text('measured', { id: 'measured' }),
    text('remaining', { id: 'remaining' })
  ], {
    id: 'measured-pane',
    direction: 'horizontal',
    sizes: [{ kind: 'content' }, { kind: 'fill' }]
  });

  const layout = layoutElement(widget, { columns: 20, rows: 3 });

  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 8, height: 3 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 1, column: 9, width: 12, height: 3 });
});

test('stack explicit sizes keep fixed chrome around fill content', () => {
  const widget = stack([
    text('Header', { id: 'header' }),
    text('Body', { id: 'body' }),
    text('Footer', { id: 'footer' })
  ], {
    id: 'vertical-workspace-frame',
    sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }, { kind: 'fixed', cells: 1 }]
  });

  const layout = layoutElement(widget, { columns: 20, rows: 6 });
  const output = renderFramePlain(renderElementFrame(widget, { columns: 20, rows: 6 }));

  assert.deepEqual(layout.children.map((child) => child.bounds), [
    { row: 1, column: 1, width: 20, height: 1 },
    { row: 2, column: 1, width: 20, height: 4 },
    { row: 6, column: 1, width: 20, height: 1 }
  ]);
  assert.equal(output.split('\n')[0], 'Header');
  assert.equal(output.split('\n')[5], 'Footer');
});

test('row explicit sizes keep fixed sidebars around fill content', () => {
  const widget = row([
    text('Nav', { id: 'nav' }),
    text('Main', { id: 'main' }),
    text('Tools', { id: 'tools' })
  ], {
    id: 'horizontal-workspace-frame',
    sizes: [{ kind: 'fixed', cells: 4 }, { kind: 'fill' }, { kind: 'content' }]
  });

  const layout = layoutElement(widget, { columns: 16, rows: 2 });

  assert.deepEqual(layout.children.map((child) => child.bounds), [
    { row: 1, column: 1, width: 4, height: 2 },
    { row: 1, column: 5, width: 7, height: 2 },
    { row: 1, column: 12, width: 5, height: 2 }
  ]);
});

test('stack and row reject size tracks that do not match child count', () => {
  assert.throws(
    () => stack([text('A'), text('B')], { sizes: [{ kind: 'fill' }] }),
    /stack sizes length 1 must match child count 2/u
  );
  assert.throws(
    () => row([text('A'), text('B')], { sizes: [{ kind: 'fill' }] }),
    /row sizes length 1 must match child count 2/u
  );
});

test('splitPane pressure keeps pane order and collapses gaps before clipping content', () => {
  const widget = splitPane([
    text('left', { id: 'left' }),
    text('middle', { id: 'middle' }),
    text('right', { id: 'right' })
  ], {
    id: 'tight-panes',
    direction: 'horizontal',
    sizes: [
      { kind: 'fixed', cells: 4 },
      { kind: 'fill' },
      { kind: 'fixed', cells: 4 }
    ],
    gap: 1
  });

  const layout = layoutElement(widget, { columns: 7, rows: 1 });

  assert.deepEqual(layout.children.map((child) => child.bounds), [
    { row: 1, column: 1, width: 4, height: 1 },
    { row: 1, column: 5, width: 0, height: 1 },
    { row: 1, column: 5, width: 3, height: 1 }
  ]);
  assert.equal(renderFramePlain(renderElementFrame(widget, { columns: 7, rows: 1 })), 'leftrig');
});

test('row pressure uses overflow priority without rewarding decorative tail content', () => {
  const widget = row([
    text('REQUIRED', {
    id: 'required',
    meta: {
        layer: {
            overflowPriority: 'required'
        }
    }
}),
    text('secondary', {
    id: 'secondary',
    meta: {
        layer: {
            overflowPriority: 'secondary'
        }
    }
}),
    text('decorative', {
    id: 'decorative',
    meta: {
        layer: {
            overflowPriority: 'decorative'
        }
    }
})
  ], { gap: 0 });

  const layout = layoutElement(widget, { columns: 5, rows: 1 });
  const output = renderFramePlain(renderElementFrame(widget, { columns: 5, rows: 1 }));

  assert.deepEqual(layout.children.map((child) => child.bounds), [
    { row: 1, column: 1, width: 4, height: 1 },
    { row: 1, column: 5, width: 1, height: 1 },
    { row: 1, column: 6, width: 0, height: 1 }
  ]);
  assert.equal(output, 'REQUs');
});

test('grid content rows and columns use measured child dimensions', () => {
  const widget = grid([
    text('wide-label', { id: 'wide-label' }),
    text('two\nrows', { id: 'two-rows' }),
    text('x', { id: 'x' }),
    text('y', { id: 'y' })
  ], {
    id: 'measured-grid',
    rows: [{ kind: 'content' }, { kind: 'fill' }],
    columns: [{ kind: 'content' }, { kind: 'fill' }],
    rowGap: 1,
    columnGap: 1
  });

  const layout = layoutElement(widget, { columns: 20, rows: 6 });

  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 10, height: 2 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 1, column: 12, width: 9, height: 2 });
  assert.deepEqual(layout.children[2]?.bounds, { row: 4, column: 1, width: 10, height: 3 });
  assert.deepEqual(layout.children[3]?.bounds, { row: 4, column: 12, width: 9, height: 3 });
});

test('named-area grid content tracks use measured area children', () => {
  const widget = grid({
    id: 'named-content-grid',
    areas: 'left right',
    rows: [{ kind: 'content' }],
    columns: [{ kind: 'content' }, { kind: 'fill' }],
    columnGap: 1,
    children: {
      left: text('wide-label', { id: 'left' }),
      right: text('right', { id: 'right' })
    }
  });

  const layout = layoutElement(widget, { columns: 20, rows: 3 });
  const output = renderFramePlain(renderElementFrame(widget, { columns: 20, rows: 3 }));

  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 10, height: 1 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 1, column: 12, width: 9, height: 1 });
  assert.equal(output.split('\n')[0], 'wide-label right');
});

test('layout flow options align, justify, and bound content regions', () => {
  const widget = surface(text('centered', { id: 'centered' }), {
    id: 'aligned-surface',
    border: { kind: 'none' },
    maxWidth: 4,
    maxHeight: 1,
    align: 'center',
    justify: 'end'
  });

  const layout = layoutElement(widget, { columns: 10, rows: 4 });

  assert.deepEqual(layout.children[0]?.bounds, { row: 4, column: 4, width: 4, height: 1 });
});

test('layout overflow controls whether min sizes can exceed parent bounds', () => {
  const clipped = layoutElement(surface(text('clip', { id: 'clip' }), {
    border: { kind: 'none' },
    minWidth: 8
  }), { columns: 4, rows: 2 });
  const visible = layoutElement(surface(text('visible', { id: 'visible' }), {
    border: { kind: 'none' },
    minWidth: 8,
    overflow: 'visible'
  }), { columns: 4, rows: 2 });

  assert.deepEqual(clipped.children[0]?.bounds, { row: 1, column: 1, width: 4, height: 2 });
  assert.deepEqual(visible.children[0]?.bounds, { row: 1, column: 1, width: 8, height: 2 });
});

test('tabs render only the selected panel as focusable content', () => {
  const widget = tabs({
    id: 'tabs',
    selected: 'second',
    tabs: [
      { id: 'first', label: 'First', panel: textInput({ id: 'first-input', value: 'hidden' }) },
      {
        id: 'second',
        label: 'Second',
        description: 'Visible editor panel',
        panel: textInput({ id: 'second-input', value: 'visible' })
      }
    ]
  });

  const layout = layoutElement(widget, { columns: 32, rows: 5 });
  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 0, height: 0 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 2, column: 1, width: 32, height: 4 });

  const frame = renderElementFrame(widget, { columns: 32, rows: 5 });
  assert.ok(frame.focusPath?.includes('second-input'));
  assert.ok(!frame.focusPath?.includes('first-input'));
  assert.match(frame.cells.map((cell) => cell.text).join(''), /\[Second\]/u);
  assert.equal(frame.accessibility.root.children?.[1]?.description, 'Visible editor panel');
});

test('tabs keep active markers disabled targets and overflow visible without color', () => {
  const frame = renderElementFrame(tabs({
    id: 'tabs',
    selected: 'alpha',
    tabs: [
      { id: 'alpha', label: 'Alpha', panel: text('Alpha panel') },
      { id: 'beta', label: 'Beta', disabled: true, panel: text('Beta panel') },
      { id: 'gamma', label: 'Gamma', panel: text('Gamma panel') }
    ],
    onAction: (action) => ({ kind: 'tabs', action })
  }), { columns: 14, rows: 3 }, { theme: noColorTheme });
  const header = renderFramePlain(frame).split('\n')[0] ?? '';

  assert.match(header, /\[Alpha\]/u);
  assert.match(header, /…/u);
  assert.deepEqual(frame.hitTargets?.map((target) => target.id), ['tabs:tab:alpha']);
  assert.equal(frame.cells.find((cell) => cell.source?.itemId === 'alpha' && cell.source.label === 'marker.selected.open')?.text, '[');
  assert.equal(frame.cells.find((cell) => cell.source?.itemId === 'alpha' && cell.source.label === 'marker.selected.close')?.text, ']');
});

test('tabs keep the selected tab visible when headers overflow', () => {
  const frame = renderElementFrame(tabs({
    id: 'tabs',
    selected: 'gamma',
    tabs: [
      { id: 'alpha', label: 'Alpha', panel: text('Alpha panel') },
      { id: 'beta', label: 'Beta', panel: text('Beta panel') },
      {
        id: 'gamma',
        label: 'Gamma',
        badge: '2',
        closable: true,
        panel: text('Gamma panel')
      },
      { id: 'delta', label: 'Delta', panel: text('Delta panel') }
    ],
    onAction: (action) => ({ kind: 'tabs', action })
  }), { columns: 15, rows: 3 }, { theme: noColorTheme });
  const header = renderFramePlain(frame).split('\n')[0] ?? '';

  assert.match(header, /…/u);
  assert.match(header, /\[Gamma 2 ×\]/u);
  assert.doesNotMatch(header, /Alpha/u);
  assert.deepEqual(frame.hitTargets?.map((target) => target.id), ['tabs:tab:gamma', 'tabs:tab:gamma:close']);
  assert.equal(frame.cells.find((cell) => cell.source?.partKind === 'overflow')?.text, '…');
  assert.equal(frame.accessibility.root.children?.[2]?.value, '2');
});

test('absolute clips child bounds without leaking outside its parent', () => {
  const widget = absolute(text('OVERFLOW', { id: 'absolute-text' }), {
    id: 'absolute-clip',
    row: 1,
    column: 4,
    width: 8,
    height: 1
  });

  const layout = layoutElement(widget, { columns: 6, rows: 1 });
  const frame = renderElementFrame(widget, { columns: 6, rows: 1 });

  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 4, width: 3, height: 1 });
  assert.equal(renderFramePlain(frame), '   OVE');
  assert.equal(frame.accessibility.root.children?.[0]?.id, 'absolute-text');
  assert.equal(frame.accessibility.root.children?.[0]?.value, 'OVERFLOW');
});

test('absolute clips top-left and fully outside placements to parent bounds', () => {
  const partial = absolute(text('FLOAT', { id: 'partial-text' }), {
    id: 'absolute-partial',
    row: 0,
    column: 0,
    width: 5,
    height: 2
  });
  const hidden = absolute(text('HIDDEN', { id: 'hidden-text' }), {
    id: 'absolute-hidden',
    row: -2,
    column: 1,
    width: 6,
    height: 1
  });

  const partialLayout = layoutElement(partial, { columns: 4, rows: 1 });
  const hiddenLayout = layoutElement(hidden, { columns: 6, rows: 2 });
  const partialFrame = renderElementFrame(partial, { columns: 4, rows: 1 });
  const hiddenFrame = renderElementFrame(hidden, { columns: 6, rows: 2 });

  assert.deepEqual(partialLayout.children[0]?.bounds, { row: 1, column: 1, width: 4, height: 1 });
  assert.deepEqual(hiddenLayout.children[0]?.bounds, { row: 1, column: 1, width: 0, height: 0 });
  assert.equal(renderFramePlain(partialFrame), 'FLOA');
  assert.equal(renderFramePlain(hiddenFrame), '');
  assert.equal(hiddenFrame.accessibility.root.children?.[0]?.id, 'hidden-text');
});

test('overlay preserves declaration order within one layer and z-order across layers', () => {
  const sameLayer = overlay([
    text('ONE', { id: 'one' }),
    text('TWO', { id: 'two' })
  ], { id: 'same-layer' });
  const layered = overlay([
    text('LOW', {
    id: 'low',
    meta: {
        layer: {
            zIndex: 2
        }
    }
}),
    text('MID', {
    id: 'mid',
    meta: {
        layer: {
            zIndex: 1
        }
    }
}),
    text('TOP', {
    id: 'top',
    meta: {
        layer: {
            zIndex: 3
        }
    }
})
  ], { id: 'layered' });
  const regions = renderElementRegions(layered, { columns: 3, rows: 1 });

  assert.equal(renderFramePlain(renderElementFrame(sameLayer, { columns: 3, rows: 1 })), 'TWO');
  assert.deepEqual(regions.map((region) => region.zIndex), [0, 1, 2, 3]);
  assert.equal(renderFramePlain(renderElementFrame(layered, { columns: 3, rows: 1 })), 'TOP');
});

test('overlay accessibility and initial focus follow topmost visual order', () => {
  const widget = overlay([
    textInput({ id: 'lower-field', value: 'lower' }),
    textInput({ id: 'upper-field', value: 'upper' })
  ], { id: 'focus-overlay' });
  const zWidget = overlay([
    text('LOW', {
    id: 'low-layer',
    meta: {
        layer: {
            zIndex: 0
        }
    }
}),
    text('TOP', {
    id: 'top-layer',
    meta: {
        layer: {
            zIndex: 10
        }
    }
})
  ], { id: 'accessibility-overlay' });

  const frame = renderElementFrame(widget, { columns: 12, rows: 2 });
  const zFrame = renderElementFrame(zWidget, { columns: 12, rows: 2 });

  assert.deepEqual(frame.focusPath, ['focus-overlay', 'upper-field']);
  assert.deepEqual(frame.accessibility.root.children?.map((node) => node.id), ['upper-field', 'lower-field']);
  assert.deepEqual(zFrame.accessibility.root.children?.map((node) => node.id), ['top-layer', 'low-layer']);
});

test('modal centers a bounded dialog and lays out child content inside the border', () => {
  const widget = modal(text('inside', { id: 'inside' }), {
    id: 'dialog',
    title: 'Confirm',
    width: 12,
    height: 5
  });
  const layout = layoutElement(widget, { columns: 30, rows: 9 });

  assert.deepEqual(layout.children[0]?.bounds, { row: 4, column: 11, width: 10, height: 3 });
  const frame = renderElementFrame(widget, { columns: 30, rows: 9 });
  const rendered = frame.cells.map((cell) => cell.text).join('');
  assert.equal(frame.accessibility.root.label, 'Confirm');
  assert.match(rendered, /inside/u);
});

test('modal accessibility label derives from structured border titles', () => {
  const spanTitleFrame = renderElementFrame(modal(text('inside', { id: 'inside' }), {
    id: 'span-dialog',
    border: { kind: 'single', title: [{ text: 'Span' }, { text: ' title' }] },
    width: 18,
    height: 5
  }), { columns: 30, rows: 9 });
  const railTitleFrame = renderElementFrame(modal(text('inside', { id: 'inside' }), {
    id: 'rail-dialog',
    border: {
      kind: 'single',
      title: {
        start: [{ text: 'Start' }],
        center: 'Center',
        end: [{ text: 'End' }]
      }
    },
    width: 26,
    height: 5
  }), { columns: 34, rows: 9 });

  assert.equal(spanTitleFrame.accessibility.root.label, 'Span title');
  assert.equal(railTitleFrame.accessibility.root.label, 'Start Center End');
});

test('modal reserves a structurally separated action area without color', () => {
  const widget = modal(text('Modal body', { id: 'body' }), {
    id: 'dialog',
    title: 'Confirm',
    width: 20,
    height: 7,
    actions: row([
      button({ id: 'cancel', label: 'Cancel' }),
      button({ id: 'confirm', label: 'OK' })
    ], { gap: 1 })
  });
  const layout = layoutElement(widget, { columns: 30, rows: 9 }, noColorTheme);

  assert.deepEqual(layout.children[0]?.bounds, { row: 3, column: 7, width: 18, height: 3 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 7, column: 7, width: 18, height: 1 });

  const frame = renderElementFrame(widget, { columns: 30, rows: 9 }, { theme: noColorTheme });
  const separatorCells = frame.cells.filter((cell) => cell.source?.ownerKind === 'modal' && cell.source.label === 'action-separator');

  assert.equal(separatorCells.length, 18);
  assert.deepEqual([...new Set(separatorCells.map((cell) => cell.text))], ['-']);
  assert.match(renderFramePlain(frame), /Modal body/u);
  assert.match(renderFramePlain(frame), /Cancel/u);
  assert.match(renderFramePlain(frame), /OK/u);
});

test('border model supports styled widget borders and borderless layout', () => {
  const doubleFrame = renderElementFrame(surface(text('inside', { id: 'inside' }), {
    id: 'panel',
    border: { kind: 'double', title: 'Panel' }
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

test('surface chrome variant renders one-line bars without border chrome', () => {
  const frame = renderElementFrame(surface(text('Menu', { id: 'menu-label' }), {
    id: 'app-chrome',
    variant: 'chrome',
    padding: { left: 1, right: 1 }
  }), { columns: 10, rows: 1 });
  const output = renderFramePlain(frame);
  const background = frame.cells.find((cell) =>
    cell.source?.ownerKind === 'surface'
    && cell.source.part === 'background'
    && cell.style?.bg?.kind === 'theme'
  );

  assert.equal(output, ' Menu');
  assert.equal(background?.style?.bg?.token, 'surface.chrome.background');
  assert.equal(frame.cells.some((cell) => cell.source?.role === 'border'), false);
});

test('surface borders degrade in tiny regions to preserve child content', () => {
  const widget = surface(text('Menu', { id: 'menu-label' }), {
    id: 'tiny-raised',
    variant: 'raised'
  });
  const layout = layoutElement(widget, { columns: 10, rows: 1 });
  const frame = renderElementFrame(widget, { columns: 10, rows: 1 });

  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 10, height: 1 });
  assert.equal(renderFramePlain(frame), 'Menu');
  assert.equal(frame.cells.some((cell) => cell.source?.role === 'border'), false);
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

test('layers render top z-index content last and hide invisible widgets', () => {
  const widget = overlay([
    text('lower', {
    id: 'lower',
    meta: {
        layer: {
            zIndex: 0
        }
    }
}),
    text('UPPER', {
    id: 'upper',
    meta: {
        layer: {
            zIndex: 5
        }
    }
}),
    text('hidden', {
    id: 'hidden',
    meta: {
        layer: {
            zIndex: 10,
            visible: false
        }
    }
})
  ], {
    id: 'layer-root'
  });

  const layout = layoutElement(widget, { columns: 12, rows: 2 });
  const frame = renderElementFrame(widget, { columns: 12, rows: 2 });
  const output = renderFramePlain(frame);

  assert.equal(layout.children[0]?.layer.zIndex, 0);
  assert.equal(layout.children[1]?.layer.zIndex, 5);
  assert.equal(layout.children[2]?.visible, false);
  assert.match(output, /^UPPER/u);
  assert.doesNotMatch(output, /lower/u);
  assert.doesNotMatch(output, /hidden/u);
});

test('focus is scoped to the topmost visible focus layer', () => {
  const widget = overlay([
    textInput({
    id: 'lower-input', value: 'lower',
    meta: {
        layer: {
            zIndex: 0
        }
    }
}),
    textInput({
    id: 'upper-input', value: 'upper',
    meta: {
        layer: {
            zIndex: 8
        }
    }
})
  ], {
    id: 'focus-root'
  });

  const frame = renderElementFrame(widget, { columns: 16, rows: 2 }, { focusPath: ['focus-root', 'lower-input'] });

  assert.deepEqual(frame.focusPath, ['focus-root', 'upper-input']);
  assert.deepEqual(cursorPosition(frame.cursor), { row: 1, column: 9 });
  assert.deepEqual(frame.cursor?.source, {
    ownerId: 'upper-input',
    ownerKind: 'textInput',
    family: 'form',
    role: 'cursor',
    part: 'cursor',
    partKind: 'cursor',
    label: 'cursor'
  });
});

test('overlapping modal renders above lower region content', () => {
  const widget = surface(overlay([
    canvas({
    id: 'modal-backdrop-canvas',
    painter({ canvas, bounds }) {
        for (let row = 0; row < bounds.height; row += 1) {
            canvas.text(0, row, [{ text: 'backdrop backdrop backdrop' }]);
        }
    },
    meta: {
        layer: {
            zIndex: 0
        }
    }
}),
    modal(text('front', { id: 'front' }), {
    id: 'dialog-layer',
    title: 'Dialog',
    width: 14,
    height: 5,
    meta: {
        layer: {
            zIndex: 20
        }
    }
})
  ], { id: 'modal-layer-overlay' }), {
    id: 'modal-layer-root',
    border: { kind: 'none' }
  });

  const regions = renderElementRegions(widget, { columns: 24, rows: 7 });
  const frame = renderElementFrame(widget, { columns: 24, rows: 7 });
  const output = renderFramePlain(frame);
  const modalRegion = regions[1];
  const leakedBackdropCells = modalRegion === undefined
    ? []
    : frame.cells.filter((cell) => cell.text === 'b' && cellInsideRect(cell, modalRegion.bounds));

  assert.deepEqual(regions.map((region) => region.zIndex), [0, 20]);
  assert.equal(modalRegion?.opacity, 'opaque');
  assert.equal(regions[0]?.cells.some((cell) => cell.text === 'b'), true);
  assert.equal(regions[1]?.cells.some((cell) => cell.text === 'f'), true);
  assert.deepEqual(leakedBackdropCells, []);
  assert.match(output, /Dialog/u);
  assert.match(output, /front/u);
});

test('dropdown renders above table content in a higher region', () => {
  const widget = surface(overlay([
    table({
    id: 'settings-table',
    columns: [
        {
          id: 'name-0', value: (row) => Array.isArray(row) ? row[0] : row, header: 'Name', width: 8 },
        {
          id: 'value-1', value: (row) => Array.isArray(row) ? row[1] : undefined, header: 'Value', width: 8 }
    ],
    rows: [
        ['Theme', 'System'],
        ['Mode', 'Compact']
    ],
    meta: {
        layer: {
            zIndex: 0
        }
    }
}),
    dropdown({
    id: 'theme-dropdown-layer',
    label: 'Theme',
    presentation: { kind: 'open', selected: 'dark', highlighted: 'dark' },
    items: [
        { id: 'light', label: 'Light' },
        { id: 'dark', label: 'Dark' }
    ],
    onAction: (action) => ({ kind: 'theme', action }),
    meta: {
        layer: {
            zIndex: 15
        }
    }
})
  ], { id: 'dropdown-layer-overlay' }), {
    id: 'dropdown-layer-root',
    border: { kind: 'none' }
  });

  const regions = renderElementRegions(widget, { columns: 28, rows: 5 });
  const output = renderFramePlain(renderElementFrame(widget, { columns: 28, rows: 5 }));
  const firstLine = output.split('\n')[0] ?? '';

  assert.deepEqual(regions.map((region) => region.zIndex), [0, 15]);
  assert.equal(regions[0]?.cells.some((cell) => cell.text === 'N'), true);
  assert.equal(regions[1]?.cells.some((cell) => cell.text === 'L'), true);
  assert.match(firstLine, /^Theme: \[Dark ▾\]/u);
  assert.doesNotMatch(firstLine, /^Name/u);
  assert.match(output, /Light/u);
});

test('context menu renders above canvas content in a higher region', () => {
  const widget = surface(overlay([
    canvas({
    id: 'context-menu-canvas',
    painter({ canvas, bounds }) {
        for (let row = 0; row < bounds.height; row += 1) {
            canvas.text(0, row, [{ text: 'canvas canvas canvas' }]);
        }
    },
    meta: {
        layer: {
            zIndex: 0
        }
    }
}),
    contextMenu({
    id: 'canvas-context-menu',
    title: 'Actions',
    selected: 'copy',
    items: [
        { id: 'copy', label: 'Copy' },
        { id: 'paste', label: 'Paste' }
    ],
    onAction: (action) => ({ kind: 'context', action }),
    meta: {
        layer: {
            zIndex: 12
        }
    }
})
  ], { id: 'context-layer-overlay' }), {
    id: 'context-layer-root',
    border: { kind: 'none' }
  });

  const regions = renderElementRegions(widget, { columns: 24, rows: 4 });
  const output = renderFramePlain(renderElementFrame(widget, { columns: 24, rows: 4 }));
  const firstLine = output.split('\n')[0] ?? '';

  assert.deepEqual(regions.map((region) => region.zIndex), [0, 12]);
  assert.equal(regions[1]?.opacity, 'opaque');
  assert.equal(regions[0]?.cells.some((cell) => cell.text === 'c'), true);
  assert.equal(regions[1]?.cells.some((cell) => cell.text === 'A'), true);
  assert.match(firstLine, /^Actions/u);
  assert.doesNotMatch(firstLine, /^canvas/u);
  assert.match(output, /Copy/u);
});

test('inheritBackground regions preserve lower background styles', () => {
  const widget = overlay([
    canvas({
      id: 'background-style-canvas',
      painter({ canvas }) {
        canvas.text(0, 0, [{ text: 'A', style: { bg: { kind: 'ansi', value: 1 } } }]);
      }
    }),
    canvas({
    id: 'inherited-background-canvas',
    painter({ canvas }) {
        canvas.text(0, 0, [{ text: 'B', style: { fg: { kind: 'ansi', value: 2 } } }]);
    },
    meta: {
        layer: {
            zIndex: 4,
            opacity: 'inheritBackground'
        }
    }
})
  ], { id: 'inherit-background-root' });
  const frame = renderElementFrame(widget, { columns: 4, rows: 2 });
  const cell = frame.cells.find((item) => item.row === 1 && item.column === 1);

  assert.equal(cell?.text, 'B');
  assert.deepEqual(cell?.style?.fg, { kind: 'ansi', value: 2 });
  assert.deepEqual(cell?.style?.bg, { kind: 'ansi', value: 1 });
});

test('screen stack supports push, pop, replace, reset, and active screen lookup', () => {
  const first = { id: 'home', state: { path: '/' } };
  const second = { id: 'details', state: { path: '/details' } };
  const pushed = screenStackReducer({ screens: [first] }, { kind: 'push', screen: second });
  assert.equal(activeScreen(pushed)?.id, 'details');

  const replaced = screenStackReducer(pushed, { kind: 'replace', screen: { id: 'settings', state: {} } });
  assert.deepEqual(replaced.screens.map((screen) => screen.id), ['home', 'settings']);

  const popped = screenStackReducer(replaced, { kind: 'pop' });
  assert.deepEqual(popped.screens.map((screen) => screen.id), ['home']);

  const reset = screenStackReducer(popped, { kind: 'reset', screens: [] });
  assert.equal(activeScreen(reset), undefined);
});

function cellInsideRect(cell, rect) {
  return cell.row >= rect.row
    && cell.row < rect.row + rect.height
    && cell.column >= rect.column
    && cell.column < rect.column + rect.width;
}

function cursorPosition(cursor) {
  return cursor === undefined ? undefined : { row: cursor.row, column: cursor.column };
}
