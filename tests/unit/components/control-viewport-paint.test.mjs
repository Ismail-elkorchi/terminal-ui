import assert from 'node:assert/strict';
import test from 'node:test';
import { defineComponent } from '../../../dist/component/index.js';
import { button, checkbox, checkboxGroup, combobox, numberInput, passwordInput, radioGroup,
  switchControl, textInput, toggleButton } from '../../../dist/components/index.js';
import { paintControlPadding } from '../../../dist/components/shared/control-padding.js';
import { viewport } from '../../../dist/layout/index.js';
import { measureElement, renderElementFrame } from '../../../dist/renderer/index.js';
import { createFrameBuffer } from '../../../dist/renderer/frame-buffer.js';
import { toRenderNode } from '../../../dist/renderer/internal/render-tree/element.js';
import { createLocalComponentRenderTarget } from '../../../dist/renderer/internal/scoped-render-target.js';
import { defaultTextWidthProfile } from '../../../dist/text/index.js';
import { defaultTheme } from '../../../dist/theme/index.js';
import { createOptionsFixture } from '../../support/collection-fixtures.mjs';

const huge = 2 ** 31 - 1;
const unicode = 'a界é🙂z';
const transition = action => action;
const styles = { root: { bg: { kind: 'ansi', value: 4 } },
  states: { disabled: { root: { fg: { kind: 'ansi', value: 2 }, dim: true } } } };
const common = overrides => ({ id: 'control', meta: { accessibleName: 'Control' }, styles, ...overrides });
const textState = { text: unicode, cursor: unicode.length, selection: { startOffset: 1, endOffsetExclusive: 4 } };
const choices = [
  { id: 'one', label: unicode, description: 'A 界 description', value: 1 },
  { id: 'two', label: 'Disabled 🙂', disabled: true, value: 2 },
];
const factories = {
  textInput: overrides => textInput({ state: textState, error: 'Invalid 界', onTransition: transition, ...common(overrides) }),
  passwordInput: overrides => passwordInput({ state: textState, error: 'Invalid 界', onTransition: transition, ...common(overrides) }),
  numberInput: overrides => numberInput({ view: { value: '12.5', cursor: 4, validity: 'valid', parsedValue: 12.5,
    selection: { startOffset: 1, endOffsetExclusive: 3 } }, error: 'Invalid 界', onTransition: transition, ...common(overrides) }),
  checkbox: overrides => checkbox({ label: unicode, checked: true, error: 'Invalid 界', onTransition: transition, ...common(overrides) }),
  switchControl: overrides => switchControl({ label: unicode, checked: true, error: 'Invalid 界', onTransition: transition, ...common(overrides) }),
  button: overrides => button({ label: unicode, onPress: transition, ...common(overrides) }),
  toggleButton: overrides => toggleButton({ label: unicode, pressed: true, onTransition: transition, ...common(overrides) }),
  radioGroup: overrides => radioGroup({ label: 'Group 界', options: choices, labelVisibility: 'hidden',
    state: { activeId: 'one', selection: { mode: 'single', selectedId: 'one' } }, error: 'Invalid 界',
    onTransition: transition, ...common(overrides) }),
  checkboxGroup: overrides => checkboxGroup({ label: 'Group 界', options: choices, labelVisibility: 'hidden',
    state: { activeId: 'one', selection: { mode: 'multiple', selectedIds: ['one'] } }, error: 'Invalid 界',
    onTransition: transition, ...common(overrides) }),
  comboboxSelect: overrides => combobox({ label: 'Combo 界', ...createOptionsFixture(choices),
    state: { kind: 'select', open: false, interaction: { selection: { mode: 'single', selectedId: 'one' } } },
    error: 'Invalid 界', onTransition: transition, ...common(overrides) }),
  comboboxAutocomplete: overrides => combobox({ label: 'Combo 界', ...createOptionsFixture(choices),
    view: { kind: 'autocomplete', open: false, input: textState, selection: { mode: 'single' } },
    error: 'Invalid 界', onTransition: transition, ...common(overrides) }),
};

function paint(element, bounds, visible, target, options = {}) {
  const renderNode = toRenderNode(element);
  renderNode.definition.renderer.render({
    renderNode, layoutNode: { bounds, viewport: visible }, buffer: target,
    theme: defaultTheme, widthProfile: options.widthProfile ?? defaultTextWidthProfile,
    focus: options.focus ?? 'self', renderChildren() {},
  });
}

function guardedPaint(element, bounds, visible) {
  const writes = [];
  const repeat = String.prototype.repeat;
  String.prototype.repeat = function(count) {
    assert.ok(count <= 64, `padding must be clipped before repeat(${count})`);
    return repeat.call(this, count);
  };
  try {
    paint(element, bounds, visible, {
      coordinateSpace: 'component', width: bounds.width, height: bounds.height, widthProfile: defaultTextWidthProfile,
      write(row, column, spans) {
        assert.ok(writes.length < 32, 'padding paint operations must not grow with logical allocation');
        assert.ok(spans.every(span => span.text.length < 128), 'paint must not submit logical-width text');
        writes.push({ row, column, spans });
      },
    });
  } finally { String.prototype.repeat = repeat; }
  return writes;
}

const logicalWrapper = defineComponent()({
  name: 'terminal-ui-tests/huge-control', identity: 'required', structure: 'composite', semantics: 'semantic',
  accessibleRole: 'group', accessibility: ({ id, slots }) => ({ id, role: 'group', children: slots.control }),
  slots: { control: { cardinality: 'one', owner: 'caller', messages: 'bubble' } },
  measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: huge, preferredHeight: 4 }),
  layout: ({ bounds }) => ({ control: bounds }),
});

for (const [name, factory] of Object.entries(factories)) {
  test(`${name} bounds padding work at both ends of a huge logical allocation`, () => {
    for (const disabled of [false, true]) {
      const element = factory({ disabled });
      const bounds = { row: 1, column: 1, width: huge, height: 4 };
      const before = measureElement(element, { columns: 80, rows: 4 });
      for (const column of [1, 10_000, huge - 5, huge + 1]) {
        const visible = { row: 1, column, width: 8, height: 2 };
        const writes = guardedPaint(element, bounds, visible);
        const padding = writes.filter(write => write.spans.some(span =>
          span.source?.description === 'value.padding' || span.source?.description === 'padding'
          || /^option\..*\.padding$/u.test(span.source?.description ?? '') || span.source?.partName === 'frame.fill'));
        if (column === 10_000 && !name.startsWith('combobox')) assert.ok(padding.length > 0);
        assert.ok(padding.reduce((sum, write) => sum + write.spans[0].text.length, 0) <= 16);
        for (const write of padding) {
          assert.ok(write.column >= column - 1);
          assert.ok(write.column + write.spans[0].text.length <= Math.min(huge, column + 7));
          assert.ok(write.row < 2);
        }
        if (column > huge) assert.equal(padding.length, 0);
      }
      assert.deepEqual(measureElement(element, { columns: 80, rows: 4 }), before);
      const repeat = String.prototype.repeat;
      String.prototype.repeat = function(count) {
        assert.ok(count <= 64, `end-to-end render attempted repeat(${count})`);
        return repeat.call(this, count);
      };
      try {
        for (const column of [0, huge - 10]) {
          const frame = renderElementFrame(viewport(logicalWrapper({ id: 'wrapper', slots: { control: element } }),
            { offset: { column } }), { columns: 10, rows: 2 });
          assert.equal(frame.width, 10);
          assert.equal(frame.height, 2);
        }
      } finally { String.prototype.repeat = repeat; }
    }
  });

  test(`${name} viewport padding matches full logical paint cropped by the target`, () => {
    const bounds = { row: 1, column: 1, width: 32, height: 4 };
    for (const disabled of [false, true]) for (const focus of ['none', 'self']) {
      const element = factory({ disabled });
      for (const widthProfile of [defaultTextWidthProfile, { emoji: 'narrow', ambiguous: 'wide' }]) {
        for (const clip of [
          { row: 1, column: 1, width: 5, height: 2 },
          { row: 1, column: 3, width: 1, height: 3 },
          { row: 1, column: 4, width: 7, height: 2 },
          { row: 1, column: 7, width: 4, height: 2 },
          { row: 2, column: 12, width: 8, height: 3 },
          { row: 1, column: 29, width: 4, height: 4 },
        ]) {
          const cells = painterViewport => {
            const buffer = createFrameBuffer(bounds.width, bounds.height, { widthProfile });
            const target = createLocalComponentRenderTarget(buffer, bounds, clip, { name: 'control-paint-test' });
            try { paint(element, bounds, painterViewport, target.target, { focus, widthProfile }); }
            finally { target.close(); }
            return buffer.snapshot().cells;
          };
          assert.deepEqual(cells(clip), cells(bounds), JSON.stringify({ name, disabled, focus, widthProfile, clip }));
        }
      }
    }
  });
}

test('number input preserves far-right stepper placement, full hit geometry and logical caret', () => {
  const element = factories.numberInput();
  const renderNode = toRenderNode(element);
  const bounds = { row: 1, column: 1, width: huge, height: 2 };
  const visible = { row: 1, column: huge - 10, width: 11, height: 1 };
  const writes = guardedPaint(element, bounds, visible);
  assert.equal(writes.find(write => write.spans.some(span => span.source?.partName === 'stepper')).column, huge - 8);
  const input = { renderNode, bounds, viewport: visible, layoutNode: { bounds, viewport: visible },
    theme: defaultTheme, widthProfile: defaultTextWidthProfile };
  const focus = renderNode.definition.renderer.focusTargets(input)[0];
  assert.equal(focus.bounds.width, huge - 8);
  assert.equal(focus.cursor.column, 7);
  const hits = renderNode.definition.renderer.hitTargets(input);
  assert.equal(hits[0].bounds.width, huge - 8);
  assert.equal(hits[1].bounds.column, huge - 6);
  assert.equal(hits[2].bounds.column, huge - 2);
  assert.deepEqual(hits[2].message({}), { kind: 'step', direction: 'increment' });
});

test('shared padding intersects both allocation and viewport before generating text', () => {
  const writes = [];
  const input = { bounds: { row: 0, column: 0, width: huge, height: huge },
    viewport: { row: huge - 1, column: huge - 3, width: 8, height: 2 },
    target: { write: (row, column, spans) => writes.push({ row, column, spans }) } };
  const options = { style: { bold: true }, link: { href: 'https://example.com' },
    source: { elementId: 'control', cellRole: 'content' } };
  paintControlPadding(input, huge - 1, 2, huge - 2, options);
  paintControlPadding(input, huge, 2, huge - 2, options);
  paintControlPadding(input, huge - 1, huge, 0, options);
  assert.deepEqual(writes, [{ row: huge - 1, column: huge - 3, spans: [{ ...options, text: '   ' }] }]);
});


test('empty, placeholder and read-only fields preserve padding at the far-right logical edge', () => {
  const bounds = { row: 1, column: 1, width: huge, height: 2 };
  const visible = { row: 1, column: huge - 3, width: 8, height: 1 };
  for (const placeholder of ['', '界🙂']) for (const readOnly of [false, true]) {
    for (const factory of [factories.textInput, factories.passwordInput]) {
      const writes = guardedPaint(factory({ state: { text: '', cursor: 0 }, placeholder, readOnly }), bounds, visible);
      const fill = writes.find(write => write.spans[0]?.source?.description === 'value.padding');
      assert.equal(fill.column, huge - 4);
      assert.equal(fill.spans[0].text, '    ');
    }
    const writes = guardedPaint(factories.numberInput({
      view: { value: '', cursor: 0, validity: 'empty' }, placeholder, readOnly,
    }), bounds, visible);
    const fill = writes.find(write => write.spans[0]?.source?.description === 'value.padding');
    if (readOnly) {
      assert.equal(fill.column, huge - 4);
      assert.equal(fill.spans[0].text, '    ');
    } else {
      assert.equal(fill, undefined, 'editable number input reserves the logical right edge for its stepper');
      assert.equal(writes.at(-2).column, huge - 8);
    }
  }
});
