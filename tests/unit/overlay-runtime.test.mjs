import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutElement, renderElementFrame, renderFramePlain } from '../../dist/renderer/index.js';
import { renderElementRegions } from '../../dist/testing/index.js';
import { canvas, contextMenu, dialog, dropdownMenu, table, text, textInput } from '../../dist/components/index.js';
import { absolute, overlay, surface } from '../../dist/layout/index.js';

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
    textInput({ id: 'lower-field', presentation: { value: 'lower', cursor: 0 } }),
    textInput({ id: 'upper-field', presentation: { value: 'upper', cursor: 0 } })
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
    id: 'lower-input', presentation: { value: 'lower', cursor: 0 },
    meta: {
        layer: {
            zIndex: 0
        }
    }
}),
    textInput({
    id: 'upper-input', presentation: { value: 'upper', cursor: 0 },
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
  assert.deepEqual(cursorPosition(frame.cursor), { row: 1, column: 4 });
  assert.deepEqual(frame.cursor?.source, {
    elementId: 'upper-input',
    elementKind: 'textInput',
    rendererFamily: 'form',
    cellRole: 'cursor',
    partName: 'cursor',
    partType: 'cursor',
    description: 'cursor'
  });
});

test('dialog clear underlay removes lower cells throughout its region', () => {
  const widget = surface(overlay([
    canvas({
    id: 'dialog-backdrop-canvas',
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
    dialog(text('front', { id: 'front' }), {
    id: 'dialog-layer',
    title: 'Dialog',
    modal: true,
    focusPolicy: { returnFocus: 'restore' },
    width: 14,
    height: 5,
    meta: {
        layer: {
            zIndex: 20
        }
    }
})
  ], { id: 'dialog-layer-overlay' }), {
    id: 'dialog-layer-root',
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
  assert.equal(modalRegion?.underlay, 'clear');
  assert.equal(regions[0]?.cells.some((cell) => cell.text === 'b'), true);
  assert.equal(regions[1]?.cells.some((cell) => cell.text === 'f'), true);
  assert.deepEqual(leakedBackdropCells, []);
  assert.match(output, /Dialog/u);
  assert.match(output, /front/u);
});

test('dropdownMenu renders above table content in a higher region', () => {
  const widget = surface(overlay([
    table({
    getRowId: (_row, index) => String(index),
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
    dropdownMenu({
    id: 'theme-dropdownMenu-layer',
    label: 'Theme',
    presentation: {
      kind: 'open',
      active: 'dark',
      menu: {
        activePath: ['dark'],
        items: [
          { kind: 'action', id: 'light', label: 'Light' },
          { kind: 'action', id: 'dark', label: 'Dark' }
        ]
      }
    },
    items: [
        { kind: 'action', id: 'light', label: 'Light' },
        { kind: 'action', id: 'dark', label: 'Dark' }
    ],
    onAction: (action) => ({ kind: 'theme', action }),
    meta: {
        layer: {
            zIndex: 15
        }
    }
})
  ], { id: 'dropdownMenu-layer-overlay' }), {
    id: 'dropdownMenu-layer-root',
    border: { kind: 'none' }
  });

  const regions = renderElementRegions(widget, { columns: 28, rows: 5 });
  const output = renderFramePlain(renderElementFrame(widget, { columns: 28, rows: 5 }));
  const firstLine = output.split('\n')[0] ?? '';

  assert.deepEqual(regions.map((region) => region.zIndex), [0, 15, 35]);
  assert.equal(regions[0]?.cells.some((cell) => cell.text === 'N'), true);
  assert.equal(regions[2]?.cells.some((cell) => cell.text === 'L'), true);
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
    presentation: {
      kind: 'open',
      anchor: { kind: 'cursor', row: 1, column: 1 },
      menu: {
        activePath: ['copy'],
        items: [
          { kind: 'action', id: 'copy', label: 'Copy' },
          { kind: 'action', id: 'paste', label: 'Paste' }
        ]
      }
    },
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

  assert.deepEqual(regions.map((region) => region.zIndex), [0, 12, 32]);
  assert.equal(regions[2]?.underlay, 'clear');
  assert.equal(regions[0]?.cells.some((cell) => cell.text === 'c'), true);
  assert.equal(regions[2]?.cells.some((cell) => cell.text === 'A'), true);
  assert.match(firstLine, /Actions/u);
  assert.match(output, /Copy/u);
});

test('inheritBackground underlay copies a lower background when the upper cell has none', () => {
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
            underlay: 'inheritBackground'
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

function cellInsideRect(cell, rect) {
  return cell.row >= rect.row
    && cell.row < rect.row + rect.height
    && cell.column >= rect.column
    && cell.column < rect.column + rect.width;
}

function cursorPosition(cursor) {
  return cursor === undefined ? undefined : { row: cursor.row, column: cursor.column };
}
