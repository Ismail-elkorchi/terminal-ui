import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutElement, renderElementFrame, renderFramePlain } from '../../dist/renderer/index.js';
import { defaultTheme, noColorTheme } from '../../dist/theme/index.js';
import { tabs, text, textInput } from '../../dist/components/index.js';

test('tabs render only the selected panel as focusable content', () => {
  const element = tabs({ meta: { accessibleName: "Tabs" },
    id: 'tabs',
    state: { activeId: 'second', selectedId: 'second' },
    tabs: [
      {
        id: 'first',
        label: 'First',
        panel: textInput({ meta: { accessibleName: "Text input" },
          id: 'first-input',
          state: { value: 'hidden', cursor: 0 },
          onTransition: (action) => action
        })
      },
      {
        id: 'second',
        label: 'Second',
        description: 'Visible editor panel',
        panel: textInput({ meta: { accessibleName: "Text input" },
          id: 'second-input',
          state: { value: 'visible', cursor: 0 },
          onTransition: (action) => action
        })
      }
    ],
    onTransition: (action) => action
  });

  const layout = layoutElement(element, { columns: 32, rows: 5 });
  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 0, height: 0 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 2, column: 1, width: 32, height: 4 });

  const frame = renderElementFrame(
    element,
    { columns: 32, rows: 5 },
    { focusPath: ['tabs', 'second-input'] }
  );
  assert.ok(frame.focusPath?.includes('second-input'));
  assert.ok(!frame.focusPath?.includes('first-input'));
  assert.match(frame.cells.map((cell) => cell.text).join(''), /▏Second/u);
  assert.equal(frame.accessibility.root.role, 'group');
  assert.equal(frame.accessibility.root.value, 'second');
  const tablist = frame.accessibility.root.children?.[0];
  assert.equal(tablist?.role, 'tablist');
  assert.equal(tablist?.children?.[1]?.role, 'tab');
  assert.equal(tablist?.children?.[1]?.controls, 'tabs:second:panel');
  assert.equal(tablist?.children?.[1]?.description, 'Visible editor panel');
  assert.equal(frame.accessibility.root.children?.[2]?.role, 'tabpanel');
  assert.equal(frame.accessibility.root.children?.[2]?.labelledBy, 'tabs:second');
  assert.equal(frame.accessibility.root.children?.[2]?.children?.[0]?.id, 'second-input');
});

test('tabs keep active markers disabled targets and overflow visible without color', () => {
  const frame = renderElementFrame(tabs({ meta: { accessibleName: "Tabs" },
    id: 'tabs',
    state: { activeId: 'alpha', selectedId: 'alpha' },
    tabs: [
      { id: 'alpha', label: 'Alpha', panel: text({ content: 'Alpha panel' }) },
      { id: 'beta', label: 'Beta', disabled: true, panel: text({ content: 'Beta panel' }) },
      { id: 'gamma', label: 'Gamma', panel: text({ content: 'Gamma panel' }) }
    ],
    onTransition: (action) => ({ kind: 'tabs', action })
  }), { columns: 14, rows: 3 }, { theme: noColorTheme });
  const header = renderFramePlain(frame).split('\n')[0] ?? '';

  assert.match(header, /▏Alpha/u);
  assert.match(header, /…/u);
  assert.deepEqual(frame.hitTargets?.map((target) => target.id), ['tabs:tab:alpha']);
  assert.equal(frame.cells.find((cell) => cell.source?.itemId === 'alpha' && cell.source.description === 'indicator')?.text, '▏');
});

test('tabs keep the selected tab visible when headers overflow', () => {
  const frame = renderElementFrame(tabs({ meta: { accessibleName: "Tabs" },
    id: 'tabs',
    state: { activeId: 'gamma', selectedId: 'gamma' },
    tabs: [
      { id: 'alpha', label: 'Alpha', panel: text({ content: 'Alpha panel' }) },
      { id: 'beta', label: 'Beta', panel: text({ content: 'Beta panel' }) },
      {
        id: 'gamma',
        label: 'Gamma',
        badge: '2',
        closable: true,
        panel: text({ content: 'Gamma panel' })
      },
      { id: 'delta', label: 'Delta', panel: text({ content: 'Delta panel' }) }
    ],
    onTransition: (action) => ({ kind: 'tabs', action })
  }), { columns: 15, rows: 3 }, { theme: noColorTheme });
  const header = renderFramePlain(frame).split('\n')[0] ?? '';

  assert.match(header, /…/u);
  assert.match(header, /▏Gamma 2 ×/u);
  assert.doesNotMatch(header, /Alpha/u);
  assert.deepEqual(frame.hitTargets?.map((target) => target.id), ['tabs:tab:gamma', 'tabs:tab:gamma:close']);
  assert.equal(frame.cells.find((cell) => cell.source?.partType === 'overflow')?.text, '…');
  const gamma = frame.accessibility.root.children?.[0]?.children?.[2];
  assert.equal(gamma?.value, '2');
  assert.deepEqual(gamma?.children, [{
    id: 'tabs:tab:gamma:close',
    role: 'button',
    label: 'Close Gamma'
  }]);
});

test('tabs paint a complete strip and raise the selected tab', () => {
  const frame = renderElementFrame(tabs({ meta: { accessibleName: "Tabs" },
    id: 'painted-tabs',
    state: { activeId: 'second', selectedId: 'second' },
    tabs: [
      { id: 'first', label: 'First', panel: text({ content: 'First panel' }) },
      { id: 'second', label: 'Second', closable: true, panel: text({ content: 'Second panel' }) }
    ],
    onTransition: (action) => action
  }), { columns: 24, rows: 3 }, { theme: defaultTheme });
  const header = frame.cells.filter((cell) => cell.row === 1);
  const selected = header.filter((cell) =>
    cell.source?.itemId === 'second'
    && cell.source?.partName !== 'separator'
  );
  const fill = header.filter((cell) => cell.source?.partName === 'header.background');

  assert.equal(header.length, 24);
  assert.equal(selected.length > 0, true);
  assert.equal(selected.every((cell) =>
    cell.source?.partName === 'badge'
      || cell.style?.bg?.token === 'surface.raised.background'
  ), true);
  assert.equal(fill.length > 0, true);
  assert.equal(fill.every((cell) => cell.style?.bg?.token === 'surface.background'), true);
  assert.equal(
    header.find((cell) => cell.source?.itemId === 'second' && cell.source?.partName === 'close')?.style?.bg?.token,
    'surface.raised.background'
  );
  assert.equal(
    header.find((cell) => cell.source?.itemId === 'second' && cell.source?.partName === 'label')?.style?.underline,
    undefined
  );
});

test('tabs bound individual labels without losing close actions or accessible names', () => {
  const frame = renderElementFrame(tabs({ meta: { accessibleName: "Tabs" },
    id: 'bounded-tabs',
    state: { activeId: 'long', selectedId: 'long' },
    maxTabWidth: 12,
    tabs: [
      {
        id: 'long',
        label: 'A very long document name',
        closable: true,
        panel: text({ content: 'Long panel' })
      },
      { id: 'short', label: 'Short', panel: text({ content: 'Short panel' }) }
    ],
    onTransition: (action) => ({ kind: 'tabs', action })
  }), { columns: 30, rows: 3 });
  const selectedCells = frame.cells.filter((cell) => cell.row === 1 && cell.source?.itemId === 'long');
  const selectedColumns = selectedCells.map((cell) => cell.column);

  assert.equal(Math.max(...selectedColumns) - Math.min(...selectedColumns) + 1, 12);
  assert.equal(selectedCells.some((cell) => cell.text === '…'), true);
  assert.equal(selectedCells.some((cell) => cell.source?.partName === 'close' && cell.text === '×'), true);
  assert.equal(frame.hitTargets?.some((target) => target.id === 'bounded-tabs:tab:long:close'), true);
  assert.equal(frame.accessibility.root.children?.[0]?.children?.[0]?.label, 'A very long document name');
});

test('a one-cell tab limit prioritizes the close action over decoration', () => {
  const frame = renderElementFrame(tabs({ meta: { accessibleName: "Tabs" },
    id: 'minimal-tab',
    state: { activeId: 'only', selectedId: 'only' },
    maxTabWidth: 1,
    tabs: [{ id: 'only', label: 'Only', closable: true, panel: text({ content: 'Panel' }) }],
    onTransition: (action) => ({ kind: 'tabs', action })
  }), { columns: 8, rows: 2 });

  assert.equal(renderFramePlain(frame).split('\n')[0], '×');
  assert.deepEqual(frame.hitTargets?.map((target) => target.id), ['minimal-tab:tab:only:close']);
});

test('tab controls preserve one-cell geometry under ambiguous-wide profiles', () => {
  const element = tabs({ meta: { accessibleName: "Tabs" },
    id: 'fixed-cell-tabs',
    state: { activeId: 'second', selectedId: 'second' },
    tabs: [
      { id: 'first', label: 'First', panel: text({ content: 'First panel' }) },
      { id: 'second', label: 'Second', closable: true, panel: text({ content: 'Second panel' }) }
    ],
    onTransition: (action) => ({ kind: 'tabs', action })
  });
  const frame = renderElementFrame(element, { columns: 24, rows: 4 }, { theme: defaultTheme });
  const wideFrame = renderElementFrame(element, { columns: 24, rows: 4 }, {
    theme: defaultTheme,
    widthProfile: { emoji: 'wide', ambiguous: 'wide' }
  });
  const normalTargets = frame.hitTargets?.map((target) => target.bounds);
  const wideTargets = wideFrame.hitTargets?.map((target) => target.bounds);
  const wideIndicator = wideFrame.cells.find((cell) =>
    cell.source?.itemId === 'second' && cell.source?.partName === 'indicator'
  );
  const wideClose = wideFrame.cells.find((cell) =>
    cell.source?.itemId === 'second' && cell.source?.partName === 'close'
  );

  assert.deepEqual(wideTargets, normalTargets);
  assert.equal(wideIndicator?.text, '|');
  assert.equal(wideIndicator?.width, 1);
  assert.equal(wideClose?.text, 'x');
  assert.equal(wideClose?.width, 1);
});
