import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutElement, renderElementFrame, renderFramePlain } from '../../dist/renderer/index.js';
import { noColorTheme } from '../../dist/theme/index.js';
import { tabs, text, textInput } from '../../dist/components/index.js';

test('tabs render only the selected panel as focusable content', () => {
  const widget = tabs({
    id: 'tabs',
    selected: 'second',
    tabs: [
      { id: 'first', label: 'First', panel: textInput({ id: 'first-input', presentation: { value: 'hidden', cursor: 0 } }) },
      {
        id: 'second',
        label: 'Second',
        description: 'Visible editor panel',
        panel: textInput({ id: 'second-input', presentation: { value: 'visible', cursor: 0 } })
      }
    ]
  });

  const layout = layoutElement(widget, { columns: 32, rows: 5 });
  assert.deepEqual(layout.children[0]?.bounds, { row: 1, column: 1, width: 0, height: 0 });
  assert.deepEqual(layout.children[1]?.bounds, { row: 2, column: 1, width: 32, height: 4 });

  const frame = renderElementFrame(widget, { columns: 32, rows: 5 });
  assert.ok(frame.focusPath?.includes('second-input'));
  assert.ok(!frame.focusPath?.includes('first-input'));
  assert.match(frame.cells.map((cell) => cell.text).join(''), /▏Second/u);
  assert.equal(frame.accessibility.root.role, 'tablist');
  assert.equal(frame.accessibility.root.value, 'second');
  assert.equal(frame.accessibility.root.children?.[1]?.role, 'tab');
  assert.equal(frame.accessibility.root.children?.[1]?.controls, 'second-input');
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

  assert.match(header, /▏Alpha/u);
  assert.match(header, /…/u);
  assert.deepEqual(frame.hitTargets?.map((target) => target.id), ['tabs:tab:alpha']);
  assert.equal(frame.cells.find((cell) => cell.source?.itemId === 'alpha' && cell.source.label === 'indicator')?.text, '▏');
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
  assert.match(header, /▏Gamma 2 ×/u);
  assert.doesNotMatch(header, /Alpha/u);
  assert.deepEqual(frame.hitTargets?.map((target) => target.id), ['tabs:tab:gamma', 'tabs:tab:gamma:close']);
  assert.equal(frame.cells.find((cell) => cell.source?.partKind === 'overflow')?.text, '…');
  assert.equal(frame.accessibility.root.children?.[2]?.value, '2');
  assert.deepEqual(frame.accessibility.root.children?.[2]?.children, [{
    id: 'tabs:tab:gamma:close',
    role: 'button',
    label: 'Close Gamma'
  }]);
});
