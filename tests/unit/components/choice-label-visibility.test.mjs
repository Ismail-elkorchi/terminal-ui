import assert from 'node:assert/strict';
import test from 'node:test';
import { checkboxGroup, radioGroup } from '../../../dist/components/forms.js';
import { measureElement, renderElementFrame, renderFramePlain } from '../../../dist/renderer/index.js';
import { renderElementInternal } from '../../../dist/renderer/internal/render-element.js';

for (const [name, factory, mode] of [['radioGroup', radioGroup, 'single'], ['checkboxGroup', checkboxGroup, 'multiple']]) {
  const options = overrides => ({
    id: 'choice', label: 'An accessible group label',
    options: [{ id: 'one', label: 'One', value: 1 }],
    state: { activeId: 'one', selection: mode === 'single'
      ? { mode, selectedId: 'one' } : { mode, selectedIds: ['one'] } },
    onTransition: transition => transition,
    ...overrides,
  });
  test(`${name} hidden label uses one actual row and preserves its accessible name`, () => {
    const element = factory(options({ labelVisibility: 'hidden', required: true }));
    const frame = renderElementFrame(element, { columns: 12, rows: 1 }, { focusPath: ['choice'] });
    assert.match(renderFramePlain(frame), /One/u);
    assert.equal(frame.cells.some(cell => cell.source?.partType === 'label'), false);
    assert.equal(frame.accessibility.root.label, 'An accessible group label');
    assert.equal(frame.accessibility.root.activeDescendant, 'choice:option:one');
    assert.equal(frame.accessibility.root.children[0].checked, true);
    assert.equal(measureElement(element, { columns: 32, rows: 8 }).preferredHeight, 1);
    assert.deepEqual(frame.hitTargets[0].bounds, { row: 1, column: 1, width: 12, height: 1 });
    assert.equal(frame.cursor.row, 1);
    const rendered = renderElementInternal(element, { columns: 12, rows: 1 });
    assert.deepEqual(rendered.regions[0].hitTargets[0].message({ kind: 'click', button: 'left', row: 1, column: 1 }),
      { kind: mode === 'single' ? 'select' : 'toggleSelection', id: 'one' });
  });
  test(`${name} keeps visible labels by default and shifts descriptions, disabled options and errors together`, () => {
    const input = options({ options: [
      { id: 'one', label: 'One', description: 'First choice', value: 1 },
      { id: 'disabled', label: 'Disabled', value: 2, disabled: true },
      { id: 'three', label: 'Three', description: 'Third choice', value: 3 },
    ], error: 'Choose one', required: true });
    const size = { columns: 32, rows: 8 };
    const defaults = factory(input);
    assert.deepEqual(renderElementFrame(defaults, size), renderElementFrame(factory({ ...input, labelVisibility: 'visible' }), size));
    const hidden = factory({ ...input, labelVisibility: 'hidden' });
    const visibleFrame = renderElementFrame(defaults, size);
    const hiddenFrame = renderElementFrame(hidden, size);
    assert.equal(measureElement(defaults, size).preferredHeight - measureElement(hidden, size).preferredHeight, 1);
    assert.deepEqual(hiddenFrame.hitTargets.map(target => [target.id, target.bounds.row, target.bounds.height]),
      [['choice:one', 1, 2], ['choice:three', 4, 2]]);
    assert.equal(renderFramePlain(hiddenFrame), renderFramePlain(visibleFrame).split('\n').slice(1).join('\n'));
    assert.deepEqual(hiddenFrame.accessibility, visibleFrame.accessibility);
  });
  test(`${name} visibility changes invalidate retained geometry and reject invalid policies`, () => {
    let previous;
    for (const labelVisibility of ['visible', 'hidden', 'visible']) {
      const element = factory(options({ labelVisibility }));
      const next = renderElementInternal(element, { columns: 24, rows: 3 }, { previous });
      assert.deepEqual(next.frame, renderElementFrame(element, { columns: 24, rows: 3 }));
      previous = next;
    }
    assert.throws(() => factory(options({ labelVisibility: 'none' })), /labelVisibility/u);
    assert.throws(() => factory(options({ labelVisibility: 'hidden', label: undefined })), /label/u);
  });
}
