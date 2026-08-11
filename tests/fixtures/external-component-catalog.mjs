import {
  componentScrollbarHitTargets,
  defineComponent,
  ignoreMessage,
  paintComponentScrollbar,
  prepareComponentScrollbar,
  prepareComponentScrollbarOptions,
  span
} from '../../dist/component/index.js';
import {
  overlay,
  portal,
  surface
} from '../../dist/layout/index.js';
import {
  measureTextCells,
  sanitizeTerminalText
} from '../../dist/text/index.js';

function cleanString(value, subject) {
  if (typeof value !== 'string') throw new TypeError(`${subject} must be a string.`);
  return sanitizeTerminalText(value).text;
}

export const externalText = defineComponent({
  name: 'terminal-ui-parity/components/text',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  metadata: ['styles', 'layer'],
  parts: ['content'],
  prepare(value) {
    const input = value;
    return { content: cleanString(input.content, 'externalText content') };
  },
  measure({ model, widthProfile }) {
    const lines = model.content.split('\n');
    return {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: Math.max(0, ...lines.map((line) => measureTextCells(line, { widthProfile }).cells)),
      preferredHeight: lines.length
    };
  },
  render({ model, target, style, source }) {
    const contentStyle = style({ part: 'content' });
    model.content.split('\n').forEach((text, row) => target.write(row, 0, [span(text, {
      ...(contentStyle === undefined ? {} : { style: contentStyle }),
      source: source({ partName: 'content', partType: 'content', cellRole: 'text' })
    })]));
  },
  accessibility: ({ id, model }) => ({ id, role: 'text', value: model.content })
});

export const externalButton = defineComponent({
  name: 'terminal-ui-parity/components/button',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  states: ['disabled', 'busy'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label'],
  prepare(value) {
    const input = value;
    return { label: cleanString(input.label, 'externalButton label') };
  },
  measure({ model, widthProfile }) {
    return {
      minWidth: 2,
      minHeight: 1,
      preferredWidth: measureTextCells(model.label, { widthProfile }).cells + 2,
      preferredHeight: 1
    };
  },
  render({ model, target, style, source }) {
    const labelStyle = style({ part: 'label', base: { bold: true } });
    target.write(0, 0, [span(` ${model.label} `, {
      ...(labelStyle === undefined ? {} : { style: labelStyle }),
      source: source({ partName: 'label', partType: 'label', cellRole: 'content' })
    })]);
  },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: ({ id, bounds }) => [{
    id: `${id}:activate`,
    bounds,
    accepts: ['click'],
    cursor: 'pointer',
    focus: { kind: 'target', targetId: 'self' },
    message: () => ({ kind: 'activate' })
  }],
  keys: () => ({
    enter: () => ({ kind: 'activate' }),
    space: () => ({ kind: 'activate' })
  }),
  accessibility: ({ id, model, focused, disabled, busy }) => ({
    id,
    role: 'button',
    label: model.label,
    ...(focused ? { focused: true } : {}),
    ...(disabled ? { disabled: true } : {}),
    ...(busy ? { busy: true } : {})
  })
});

export const externalTextInput = defineComponent({
  name: 'terminal-ui-parity/components/text-input',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  states: ['disabled', 'readOnly'],
  metadata: ['focus', 'styles'],
  parts: ['value'],
  prepare(value) {
    const input = value;
    return {
      label: cleanString(input.label, 'externalTextInput label'),
      value: cleanString(input.value, 'externalTextInput value')
    };
  },
  measure({ model, widthProfile }) {
    return {
      minWidth: 1,
      minHeight: 1,
      preferredWidth: Math.max(8, measureTextCells(model.value, { widthProfile }).cells + 1),
      preferredHeight: 1
    };
  },
  render({ model, target, style, source }) {
    const valueStyle = style({ part: 'value' });
    target.write(0, 0, [span(model.value, {
      ...(valueStyle === undefined ? {} : { style: valueStyle }),
      source: source({ partName: 'value', partType: 'value', cellRole: 'content' })
    })]);
  },
  focusTargets: ({ bounds, model, widthProfile }) => [{
    id: 'self',
    bounds,
    cursor: {
      row: 0,
      column: Math.min(bounds.width, measureTextCells(model.value, { widthProfile }).cells)
    }
  }],
  hitTargets: ({ id, bounds }) => [{
    id: `${id}:input`,
    bounds,
    cursor: 'text',
    focus: { kind: 'target', targetId: 'self' },
    message: () => ignoreMessage()
  }],
  keys: ({ readOnly, model }) => ({
    ...(readOnly ? {} : { backspace: () => ({ kind: 'deleteBackward' }) }),
    enter: () => ({ kind: 'submit', value: model.value })
  }),
  onInput: ({ text, readOnly }) => readOnly ? ignoreMessage() : { kind: 'insert', text },
  onPaste: ({ text, readOnly }) => readOnly ? ignoreMessage() : { kind: 'insert', text },
  accessibility: ({ id, model, focused, disabled, readOnly }) => ({
    id,
    role: 'textbox',
    label: model.label,
    value: model.value,
    ...(focused ? { focused: true } : {}),
    ...(disabled ? { disabled: true } : {}),
    ...(readOnly ? { readOnly: true } : {})
  })
});

export const externalVirtualList = defineComponent({
  name: 'terminal-ui-parity/components/virtual-list',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  states: ['disabled'],
  metadata: ['focus', 'styles'],
  parts: ['item', 'scrollbar'],
  prepare(value) {
    const input = value;
    if (!Array.isArray(input.items)) throw new TypeError('externalVirtualList items must be an array.');
    const items = Object.freeze(input.items.map((item, index) => cleanString(item, `externalVirtualList item ${String(index)}`)));
    const offset = input.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0) throw new RangeError('externalVirtualList offset must be a non-negative safe integer.');
    const scrollbar = prepareComponentScrollbarOptions(input.scrollbar, 'externalVirtualList scrollbar');
    return { items, offset: Math.min(offset, Math.max(0, items.length - 1)), ...(scrollbar === undefined ? {} : { scrollbar }) };
  },
  measure({ model, constraints, widthProfile }) {
    const sample = model.items.slice(model.offset, model.offset + Math.max(1, constraints.height));
    return {
      minWidth: 1,
      minHeight: 1,
      preferredWidth: Math.max(1, ...sample.map((item) => measureTextCells(item, { widthProfile }).cells)),
      preferredHeight: Math.min(model.items.length, Math.max(1, constraints.height))
    };
  },
  render(input) {
    const plan = virtualListPlan(input);
    const rows = input.model.items.slice(input.model.offset, input.model.offset + plan.contentBounds.height);
    rows.forEach((item, row) => {
      const itemStyle = input.style({ part: 'item' });
      input.target.write(row, 0, [span(item, {
        ...(itemStyle === undefined ? {} : { style: itemStyle }),
        source: input.source({ partName: `item.${String(input.model.offset + row)}`, partType: 'item', cellRole: 'text', itemIndex: input.model.offset + row })
      })]);
    });
    paintComponentScrollbar({ target: input.target, plan, theme: input.theme, source: input.source });
  },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  keys: () => ({
    arrowUp: () => ({ kind: 'move', delta: -1 }),
    arrowDown: () => ({ kind: 'move', delta: 1 })
  }),
  hitTargets(input) {
    const plan = virtualListPlan(input);
    const visible = input.model.items.slice(input.model.offset, input.model.offset + plan.contentBounds.height);
    return [
      ...visible.map((_item, row) => ({
        id: `${input.id}:item:${String(input.model.offset + row)}`,
        bounds: { row, column: 0, width: plan.contentBounds.width, height: 1 },
        cursor: 'pointer',
        focus: { kind: 'target', targetId: 'self' },
        message: () => ({ kind: 'select', index: input.model.offset + row })
      })),
      ...componentScrollbarHitTargets({
        id: input.id,
        plan,
        onScroll: (event) => ({ kind: 'scroll', event })
      })
    ];
  },
  accessibility(input) {
    const height = Math.max(0, input.bounds.height - (input.model.scrollbar === undefined ? 0 : 0));
    const end = Math.min(input.model.items.length, input.model.offset + height);
    return {
      id: input.id,
      role: 'list',
      label: 'Items',
      ...(input.focused ? { focused: true } : {}),
      window: {
        startIndex: input.model.offset,
        endIndexExclusive: end,
        totalCount: input.model.items.length,
        omittedBefore: input.model.offset,
        omittedAfter: input.model.items.length - end
      },
      children: input.model.items.slice(input.model.offset, end).map((item, index) => ({
        id: `${input.id}:item:${String(input.model.offset + index)}`,
        role: 'listitem',
        label: item,
        position: { positionInSet: input.model.offset + index + 1, setSize: input.model.items.length }
      }))
    };
  }
});

function virtualListPlan(input) {
  return prepareComponentScrollbar({
    bounds: input.bounds,
    scroll: {
      offsetRow: input.model.offset,
      offsetColumn: 0,
      contentRows: input.model.items.length,
      contentColumns: input.bounds.width,
      viewportRows: input.bounds.height,
      viewportColumns: input.bounds.width,
      followTail: false
    },
    ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
    defaultAxis: 'vertical'
  });
}

export const externalSelect = defineComponent({
  name: 'terminal-ui-parity/components/select',
  identity: 'required',
  structure: 'composed',
  semantics: 'semantic',
  states: ['disabled'],
  metadata: ['focus', 'layer', 'styles'],
  prepare(value) {
    const input = value;
    if (!Array.isArray(input.items)) throw new TypeError('externalSelect items must be an array.');
    const items = Object.freeze(input.items.map((item, index) => cleanString(item, `externalSelect item ${String(index)}`)));
    const selectedIndex = input.selectedIndex ?? 0;
    if (!Number.isSafeInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= Math.max(1, items.length)) {
      throw new RangeError('externalSelect selectedIndex is outside its items.');
    }
    if (typeof input.open !== 'boolean') throw new TypeError('externalSelect open must be a boolean.');
    return { label: cleanString(input.label, 'externalSelect label'), items, selectedIndex, open: input.open };
  },
  compose({ id, model, emit, layer }) {
    const selected = model.items[model.selectedIndex] ?? '';
    const trigger = externalText({
      id: `${id}:trigger`,
      content: `${model.label}: ${selected}`
    });
    if (!model.open) return trigger;
    const choices = externalVirtualList({
      id: `${id}:options`,
      items: model.items,
      offset: 0,
      scrollbar: { visible: 'auto' },
      meta: { focus: { disabled: true } },
      onAction: (action) => action.kind === 'select'
        ? emit({ kind: 'select', index: action.index })
        : emit(action)
    });
    const popup = portal(surface(choices, { appearance: 'raised', border: { kind: 'single' }, maxHeight: 6 }), {
      anchor: { kind: 'allocation' },
      placement: 'below',
      onOutsidePress: () => emit({ kind: 'close' }),
      meta: { layer: { ...layer, zIndex: 20, underlay: 'clear' } }
    });
    return overlay([trigger, popup]);
  },
  keys: ({ model }) => ({
    enter: () => ({ kind: model.open ? 'close' : 'toggle' }),
    escape: () => ({ kind: 'close' })
  }),
  focusTargets: ({ bounds }) => [{ id: 'self', bounds: { row: 0, column: 0, width: bounds.width, height: Math.min(1, bounds.height) } }],
  hitTargets: ({ id, bounds }) => bounds.width === 0 || bounds.height === 0 ? [] : [{
    id: `${id}:trigger`,
    bounds: { row: 0, column: 0, width: bounds.width, height: 1 },
    accepts: ['click'],
    cursor: 'pointer',
    focus: { kind: 'target', targetId: 'self' },
    message: () => ({ kind: 'toggle' })
  }],
  accessibility: ({ id, model, disabled, focused, focusedTargetId }) => ({
    id,
    role: 'combobox',
    label: model.label,
    value: model.items[model.selectedIndex] ?? '',
    expanded: model.open,
    ...(disabled ? { disabled: true } : {}),
    ...(focused || focusedTargetId === 'self' ? { focused: true } : {}),
    children: model.open ? [{
      id: `${id}:options`,
      role: 'listbox',
      label: `${model.label} options`,
      children: model.items.map((item, index) => ({
        id: `${id}:option:${String(index)}`,
        role: 'option',
        label: item,
        selected: index === model.selectedIndex
      }))
    }] : []
  })
});

const externalDialogSlots = {
  content: { cardinality: 'one', owner: 'caller', messages: 'bubble' }
};

export const externalDialog = defineComponent({
  name: 'terminal-ui-parity/components/dialog',
  identity: 'required',
  structure: 'composed',
  semantics: 'semantic',
  slots: externalDialogSlots,
  metadata: ['focus', 'layer', 'styles'],
  prepare(value) {
    const input = value;
    if (typeof input.modal !== 'boolean') throw new TypeError('externalDialog modal must be a boolean.');
    return { title: cleanString(input.title, 'externalDialog title'), modal: input.modal };
  },
  layer: ({ model }) => ({ zIndex: 30, underlay: 'clear', ...(model.modal ? { backdrop: 'viewport' } : {}) }),
  focusScope: ({ model }) => model.modal ? { kind: 'contain', restore: true } : undefined,
  keys: () => ({ escape: () => ({ kind: 'dismiss' }) }),
  compose({ id, model, slots, emit, layer }) {
    return portal(surface(slots.content, {
      id: `${id}:surface`,
      title: model.title,
      appearance: 'raised',
      border: { kind: 'single' },
      padding: 1,
      minWidth: 8,
      minHeight: 3
    }), {
      id: `${id}:portal`,
      anchor: { kind: 'allocation' },
      placement: 'center',
      onOutsidePress: () => emit({ kind: 'dismiss' }),
      meta: { layer: { ...layer, zIndex: 30, underlay: 'clear', ...(model.modal ? { backdrop: 'viewport' } : {}) } }
    });
  },
  accessibility: ({ id, model, children }) => ({
    id,
    role: 'dialog',
    label: model.title,
    ...(model.modal ? { scope: { kind: 'modal', trapsFocus: true, obscuresBackground: true } } : {}),
    children
  })
});

const externalTooltipSlots = {
  trigger: { cardinality: 'one', owner: 'caller', messages: 'bubble' }
};

export const externalTooltip = defineComponent({
  name: 'terminal-ui-parity/components/tooltip',
  identity: 'required',
  structure: 'composed',
  semantics: 'semantic',
  slots: externalTooltipSlots,
  prepare(value) {
    const input = value;
    if (typeof input.open !== 'boolean') throw new TypeError('externalTooltip open must be a boolean.');
    return { content: cleanString(input.content, 'externalTooltip content'), open: input.open };
  },
  compose({ id, model, slots }) {
    if (!model.open) return slots.trigger;
    return overlay([
      slots.trigger,
      portal(surface(externalText({ id: `${id}:text`, content: model.content }), {
        appearance: 'raised',
        border: { kind: 'single' },
        padding: { left: 1, right: 1 }
      }), {
        anchor: { kind: 'allocation' },
        placement: 'above',
        meta: { layer: { zIndex: 40, underlay: 'clear' } }
      })
    ]);
  },
  accessibility: ({ id, model, children }) => ({
    id,
    role: 'group',
    label: 'Tooltip owner',
    children: [
      ...children,
      ...(model.open ? [{ id: `${id}:tooltip`, role: 'tooltip', label: model.content }] : [])
    ]
  })
});

export const externalChart = defineComponent({
  name: 'terminal-ui-parity/components/chart',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  metadata: ['styles', 'layer'],
  parts: ['bar'],
  prepare(value) {
    const input = value;
    if (!Array.isArray(input.values) || input.values.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0)) {
      throw new TypeError('externalChart values must be finite non-negative numbers.');
    }
    return { label: cleanString(input.label, 'externalChart label'), values: Object.freeze([...input.values]) };
  },
  measure({ model }) {
    return { minWidth: 1, minHeight: 1, preferredWidth: model.values.length, preferredHeight: 4 };
  },
  render({ model, target, style, source, bounds }) {
    const maximum = Math.max(1, ...model.values);
    model.values.slice(0, bounds.width).forEach((value, column) => {
      const height = Math.min(bounds.height, Math.round(value / maximum * bounds.height));
      for (let offset = 0; offset < height; offset += 1) {
        const barStyle = style({ part: 'bar', base: { fg: { kind: 'theme', token: 'accent.primary' } } });
        target.write(bounds.height - offset - 1, column, [span('█', {
          ...(barStyle === undefined ? {} : { style: barStyle }),
          source: source({ partName: `bar.${String(column)}`, partType: 'bar', cellRole: 'chart', itemIndex: column })
        })]);
      }
    });
  },
  accessibility: ({ id, model }) => ({
    id,
    role: 'group',
    label: model.label,
    description: model.values.join(', ')
  })
});
