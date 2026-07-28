import assert from 'node:assert/strict';
import test from 'node:test';
import { gridCellRects, layoutElement, renderElementFrame, renderFramePlain, splitTracks } from '../../dist/renderer/index.js';
import { button, commandInput, field, form, searchPicker, text, textArea, textInput } from '../../dist/components/index.js';
import { column, grid, row, splitPane, surface } from '../../dist/layout/index.js';
import { prepareTextDocument, textCaretAt } from '../../dist/text/index.js';
import { prepareSearchPickerIndex } from '../../dist/behavior/index.js';

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

test('grid and splitPane layouts arrange common app frames', () => {
  const element = grid([
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
    commandInput({ id: 'command', presentation: { value: '/help', cursor: 0, suggestions: [] } })
  ], {
    id: 'workspace-frame',
    rows: [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }, { kind: 'fixed', cells: 1 }, { kind: 'fixed', cells: 1 }],
    columns: [{ kind: 'fill' }]
  });

  const layout = layoutElement(element, { columns: 40, rows: 8 });
  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 40, height: 1 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 2, column: 1, width: 40, height: 5 });
  assert.deepEqual(layout.children[1]?.children[0]?.bounds, { row: 2, column: 1, width: 10, height: 5 });
  assert.deepEqual(layout.children[1]?.children[1]?.bounds, { row: 2, column: 11, width: 22, height: 5 });
  assert.deepEqual(layout.children[2]?.bounds, { row: 7, column: 1, width: 40, height: 1 });
  assert.deepEqual(layout.children[3]?.bounds, { row: 8, column: 1, width: 40, height: 1 });
});

test('splitPane content tracks use measured child width', () => {
  const element = splitPane([
    text('measured', { id: 'measured' }),
    text('remaining', { id: 'remaining' })
  ], {
    id: 'measured-pane',
    direction: 'horizontal',
    sizes: [{ kind: 'content' }, { kind: 'fill' }]
  });

  const layout = layoutElement(element, { columns: 20, rows: 3 });

  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 8, height: 3 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 1, column: 9, width: 12, height: 3 });
});

test('form content tracks include field labels and control gaps', () => {
  const element = column([
    form([
      field([
        textInput({ id: 'name', presentation: { value: '', cursor: 0 } })
      ], { id: 'name-field', label: 'Name' }),
      button({ id: 'submit', label: 'Submit' })
    ], { id: 'profile-form', gap: 1 }),
    text('remaining')
  ], {
    sizes: [{ kind: 'content' }, { kind: 'fill' }]
  });

  const layout = layoutElement(element, { columns: 30, rows: 8 });

  assert.equal(layout.children[0]?.bounds.height, 4);
  assert.equal(layout.children[0]?.children[0]?.bounds.height, 2);
  assert.equal(layout.children[0]?.children[0]?.children[0]?.bounds.height, 1);
});

test('wrapped text-area content tracks retain intrinsic width', () => {
  const element = row([
    textArea({
      id: 'wrapped-content-editor',
      presentation: { document: prepareTextDocument('x'), caret: textCaretAt(0 )},
      wrap: true
    }),
    text('remaining', { id: 'wrapped-content-sibling' })
  ], {
    id: 'wrapped-content-row',
    sizes: [{ kind: 'content' }, { kind: 'fill' }]
  });

  const layout = layoutElement(element, { columns: 30, rows: 3 });

  assert.equal(layout.children[0]?.bounds.width, 3);
  assert.equal(layout.children[1]?.bounds.width, 27);
});

test('searchPicker content tracks use the active text-width profile', () => {
  const element = row([
    searchPicker({
      id: 'profiled-searchPicker',
      searchPickerIndex: prepareSearchPickerIndex([{ id: 'emoji', label: '🙂'.repeat(10), value: 'emoji' }]),
      query: '',
      onSelect: (entry) => entry.value
    }),
    text('remaining', { id: 'profiled-searchPicker-sibling' })
  ], {
    id: 'profiled-searchPicker-row',
    sizes: [{ kind: 'content' }, { kind: 'fill' }]
  });
  const narrow = layoutElement(
    element,
    { columns: 40, rows: 5 },
    undefined,
    { emoji: 'narrow', ambiguous: 'narrow' }
  );
  const wide = layoutElement(
    element,
    { columns: 40, rows: 5 },
    undefined,
    { emoji: 'wide', ambiguous: 'narrow' }
  );

  assert.equal(narrow.children[0]?.bounds.width, 16);
  assert.equal(wide.children[0]?.bounds.width, 22);
});

test('column children use their measured height unless a fill track is explicit', () => {
  const compact = column([
    text('Title', { id: 'compact-title' }),
    text('Description', { id: 'compact-description' }),
    button({ id: 'compact-action', label: 'Continue' })
  ], { gap: 1 });
  const expanded = column([
    text('Title', { id: 'expanded-title' }),
    text('Body', { id: 'expanded-body' })
  ], {
    sizes: [{ kind: 'content' }, { kind: 'fill' }]
  });

  const compactLayout = layoutElement(compact, { columns: 30, rows: 20 });
  const expandedLayout = layoutElement(expanded, { columns: 30, rows: 20 });

  assert.deepEqual(compactLayout.children.map((child) => child.bounds), [
    { row: 1, column: 1, width: 30, height: 1 },
    { row: 3, column: 1, width: 30, height: 1 },
    { row: 5, column: 1, width: 30, height: 1 }
  ]);
  assert.deepEqual(expandedLayout.children.map((child) => child.bounds), [
    { row: 1, column: 1, width: 30, height: 1 },
    { row: 2, column: 1, width: 30, height: 19 }
  ]);
});

test('column explicit sizes keep fixed header and footer tracks around fill content', () => {
  const element = column([
    text('Header', { id: 'header' }),
    text('Body', { id: 'body' }),
    text('Footer', { id: 'footer' })
  ], {
    id: 'vertical-workspace-frame',
    sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }, { kind: 'fixed', cells: 1 }]
  });

  const layout = layoutElement(element, { columns: 20, rows: 6 });
  const output = renderFramePlain(renderElementFrame(element, { columns: 20, rows: 6 }));

  assert.deepEqual(layout.children.map((child) => child.bounds), [
    { row: 1, column: 1, width: 20, height: 1 },
    { row: 2, column: 1, width: 20, height: 4 },
    { row: 6, column: 1, width: 20, height: 1 }
  ]);
  assert.equal(output.split('\n')[0], 'Header');
  assert.equal(output.split('\n')[5], 'Footer');
});

test('row explicit sizes keep fixed sidebars around fill content', () => {
  const element = row([
    text('Nav', { id: 'nav' }),
    text('Main', { id: 'main' }),
    text('Tools', { id: 'tools' })
  ], {
    id: 'horizontal-workspace-frame',
    sizes: [{ kind: 'fixed', cells: 4 }, { kind: 'fill' }, { kind: 'content' }]
  });

  const layout = layoutElement(element, { columns: 16, rows: 2 });

  assert.deepEqual(layout.children.map((child) => child.bounds), [
    { row: 1, column: 1, width: 4, height: 2 },
    { row: 1, column: 5, width: 7, height: 2 },
    { row: 1, column: 12, width: 5, height: 2 }
  ]);
});

test('column and row reject size tracks that do not match child count', () => {
  assert.throws(
    () => column([text('A'), text('B')], { sizes: [{ kind: 'fill' }] }),
    /column sizes length 1 must match child count 2/u
  );
  assert.throws(
    () => row([text('A'), text('B')], { sizes: [{ kind: 'fill' }] }),
    /row sizes length 1 must match child count 2/u
  );
});

test('splitPane pressure keeps pane order and collapses gaps before clipping content', () => {
  const element = splitPane([
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

  const layout = layoutElement(element, { columns: 7, rows: 1 });

  assert.deepEqual(layout.children.map((child) => child.bounds), [
    { row: 1, column: 1, width: 4, height: 1 },
    { row: 1, column: 5, width: 0, height: 1 },
    { row: 1, column: 5, width: 3, height: 1 }
  ]);
  assert.equal(renderFramePlain(renderElementFrame(element, { columns: 7, rows: 1 })), 'leftrig');
});

test('row pressure uses overflow priority without rewarding decorative tail content', () => {
  const element = row([
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

  const layout = layoutElement(element, { columns: 5, rows: 1 });
  const output = renderFramePlain(renderElementFrame(element, { columns: 5, rows: 1 }));

  assert.deepEqual(layout.children.map((child) => child.bounds), [
    { row: 1, column: 1, width: 4, height: 1 },
    { row: 1, column: 5, width: 1, height: 1 },
    { row: 1, column: 6, width: 0, height: 1 }
  ]);
  assert.equal(output, 'REQUs');
});

test('grid content rows and columns use measured child dimensions', () => {
  const element = grid([
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

  const layout = layoutElement(element, { columns: 20, rows: 6 });

  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 10, height: 2 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 1, column: 12, width: 9, height: 2 });
  assert.deepEqual(layout.children[2]?.bounds, { row: 4, column: 1, width: 10, height: 3 });
  assert.deepEqual(layout.children[3]?.bounds, { row: 4, column: 12, width: 9, height: 3 });
});

test('named-area grid content tracks use measured area children', () => {
  const element = grid({
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

  const layout = layoutElement(element, { columns: 20, rows: 3 });
  const output = renderFramePlain(renderElementFrame(element, { columns: 20, rows: 3 }));

  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 10, height: 1 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 1, column: 12, width: 9, height: 1 });
  assert.equal(output.split('\n')[0], 'wide-label right');
});

test('layout flow options align, justify, and bound content regions', () => {
  const element = surface(text('centered', { id: 'centered' }), {
    id: 'aligned-surface',
    border: { kind: 'none' },
    maxWidth: 4,
    maxHeight: 1,
    align: 'center',
    justify: 'end'
  });

  const layout = layoutElement(element, { columns: 10, rows: 4 });

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
