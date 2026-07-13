import type { ElementKeyBindings } from '../../element/metadata.ts';
import type { ListOptions, PaginatorOptions, TableOptions, TreeOptions } from '../options/content.ts';
import type { NumberInputAction } from '../../ui-model/number-input.ts';
import type { RangeSliderOptions, SliderOptions } from '../options/forms.ts';
import type {
  CheckboxGroupOptions,
  ColorSwatchPickerOptions,
  RadioGroupOptions,
  SelectOptions
} from '../options/forms.ts';
import type { MenuItem } from '../options/menus.ts';
import type { DropdownMenuAction, MenuAction } from '../../ui-model/menu.ts';
import type { CommandInputAction } from '../../ui-model/command-input.ts';
import type { PaletteAction } from '../../ui-model/palette.ts';
import type { TextEditOperation } from '../../text/index.ts';
import type { RenderMenuItem } from '../../renderer/model/props/menus.ts';
import { mergeKeyBindings } from '../../authoring/metadata.ts';

export {
  componentMetaProps,
  interactionProps,
  mergeKeyBindings,
  withMetaDefaults
} from '../../authoring/metadata.ts';

export function listKeyBindings<TValue, TMessage>(
  options: ListOptions<TValue, TMessage>
): ElementKeyBindings<TMessage> | undefined {
  const onAction = options.onAction;
  if (onAction === undefined) return options.keys;
  const selectedId = options.selectedId;
  const selectedIndex = selectedId === undefined
    ? -1
    : options.items.findIndex((item, index) => options.getItemId(item, index) === selectedId);
  const generated = {
    arrowUp: () => onAction({ kind: 'move', delta: -1 }),
    arrowDown: () => onAction({ kind: 'move', delta: 1 }),
    pageUp: () => onAction({ kind: 'page', delta: -1 }),
    pageDown: () => onAction({ kind: 'page', delta: 1 }),
    home: () => onAction({ kind: 'first' }),
    end: () => onAction({ kind: 'last' }),
    ...(selectedId === undefined || selectedIndex < 0 ? {} : {
      enter: () => onAction({ kind: 'activate', id: selectedId, index: selectedIndex })
    })
  } satisfies ElementKeyBindings<TMessage>;
  return mergeKeyBindings(generated, options.keys);
}

export function tableKeyBindings<TRow, TMessage>(
  options: TableOptions<TRow, TMessage>
): ElementKeyBindings<TMessage> | undefined {
  const onAction = options.onAction;
  if (onAction === undefined) return options.keys;
  const selectedRowId = options.selectedRowId;
  const selectedRowIndex = selectedRowId === undefined
    ? -1
    : options.rows.findIndex((row, index) => options.getRowId(row, index) === selectedRowId);
  const generated = {
    arrowUp: () => onAction({ kind: 'moveRow', delta: -1 }),
    arrowDown: () => onAction({ kind: 'moveRow', delta: 1 }),
    arrowLeft: () => onAction({ kind: 'moveColumn', delta: -1 }),
    arrowRight: () => onAction({ kind: 'moveColumn', delta: 1 }),
    pageUp: () => onAction({ kind: 'page', delta: -1 }),
    pageDown: () => onAction({ kind: 'page', delta: 1 }),
    home: () => onAction({ kind: 'firstRow' }),
    end: () => onAction({ kind: 'lastRow' }),
    ...(selectedRowId === undefined || selectedRowIndex < 0 ? {} : {
      enter: () => onAction({
        kind: 'activate',
        rowId: selectedRowId,
        rowIndex: selectedRowIndex,
        ...(options.selectedCell?.column === undefined ? {} : { column: options.selectedCell.column })
      })
    })
  } satisfies ElementKeyBindings<TMessage>;
  return mergeKeyBindings(generated, options.keys);
}

export function treeKeyBindings<TMetadata extends Readonly<Record<string, unknown>>, TMessage>(
  options: TreeOptions<TMetadata, TMessage>
): ElementKeyBindings<TMessage> | undefined {
  const onAction = options.onAction;
  if (onAction === undefined) return options.keys;
  const selected = options.selected;
  const generated = {
    arrowUp: () => onAction({ kind: 'move', delta: -1 }),
    arrowDown: () => onAction({ kind: 'move', delta: 1 }),
    ...(selected === undefined ? {} : {
      arrowRight: () => onAction({ kind: 'expand', id: selected }),
      arrowLeft: () => onAction({ kind: 'collapse', id: selected }),
      enter: () => onAction({ kind: 'activate', id: selected })
    })
  } satisfies ElementKeyBindings<TMessage>;
  return mergeKeyBindings(generated, options.keys);
}

export function paginatorKeyBindings<TMessage>(
  options: PaginatorOptions<TMessage>
): ElementKeyBindings<TMessage> | undefined {
  const onAction = options.onAction;
  if (onAction === undefined) return options.keys;
  const generated = {
    home: () => onAction({ kind: 'first' }),
    arrowLeft: () => onAction({ kind: 'previous' }),
    arrowUp: () => onAction({ kind: 'previous' }),
    pageUp: () => onAction({ kind: 'previous' }),
    arrowRight: () => onAction({ kind: 'next' }),
    arrowDown: () => onAction({ kind: 'next' }),
    pageDown: () => onAction({ kind: 'next' }),
    end: () => onAction({ kind: 'last' })
  } satisfies ElementKeyBindings<TMessage>;
  return mergeKeyBindings(generated, options.keys);
}

export function calendarKeyBindings<TMessage>(
  options: import('../options/forms.ts').CalendarOptions<TMessage>
): ElementKeyBindings<TMessage> | undefined {
  const onAction = options.onAction;
  if (onAction === undefined) return options.keys;
  const focused = options.focused === undefined
    ? undefined
    : options.days.find((day) => day.id === options.focused && day.disabled !== true && day.hidden !== true);
  const generated = {
    arrowLeft: () => onAction({ kind: 'moveFocus', days: -1 }),
    arrowRight: () => onAction({ kind: 'moveFocus', days: 1 }),
    arrowUp: () => onAction({ kind: 'moveFocus', days: -7 }),
    arrowDown: () => onAction({ kind: 'moveFocus', days: 7 }),
    pageUp: () => onAction({ kind: 'moveMonth', months: -1 }),
    pageDown: () => onAction({ kind: 'moveMonth', months: 1 }),
    home: () => onAction({ kind: 'startOfWeek' }),
    end: () => onAction({ kind: 'endOfWeek' }),
    ...(focused === undefined ? {} : { enter: () => onAction({ kind: 'select', date: focused.date }) })
  } satisfies ElementKeyBindings<TMessage>;
  return mergeKeyBindings(generated, options.keys);
}

export function activationKeyBindings<TMessage>(
  handler: (() => TMessage | undefined) | undefined,
  explicit: ElementKeyBindings<TMessage> | undefined
): ElementKeyBindings<TMessage> | undefined {
  return mergeKeyBindings(handler === undefined ? undefined : { enter: handler }, explicit);
}

export function commandInputKeyBindings<TMessage>(
  onAction: (action: CommandInputAction) => TMessage
): ElementKeyBindings<TMessage> {
  return {
    backspace: () => onAction({ kind: 'deleteBackward' }),
    delete: () => onAction({ kind: 'deleteForward' }),
    arrowLeft: () => onAction({ kind: 'moveLeft' }),
    arrowRight: () => onAction({ kind: 'moveRight' }),
    home: () => onAction({ kind: 'moveHome' }),
    end: () => onAction({ kind: 'moveEnd' })
  };
}

export function paletteKeyBindings<TMessage>(
  onAction: (action: PaletteAction) => TMessage
): ElementKeyBindings<TMessage> {
  return {
    backspace: () => onAction({ kind: 'deleteQueryBackward' }),
    arrowUp: () => onAction({ kind: 'moveSelection', delta: -1 }),
    arrowDown: () => onAction({ kind: 'moveSelection', delta: 1 })
  };
}

export function textInputKeyBindings<TMessage>(
  onEdit: ((operation: TextEditOperation) => TMessage) | undefined,
  onSubmit: TMessage | undefined,
  explicit: ElementKeyBindings<TMessage> | undefined
): ElementKeyBindings<TMessage> | undefined {
  const generated = editKeyBindings(onEdit, false);
  return mergeKeyBindings(
    mergeKeyBindings(generated, onSubmit === undefined ? undefined : { enter: () => onSubmit }),
    explicit
  );
}

export function textAreaKeyBindings<TMessage>(
  onEdit: ((operation: TextEditOperation) => TMessage) | undefined,
  explicit: ElementKeyBindings<TMessage> | undefined
): ElementKeyBindings<TMessage> | undefined {
  return mergeKeyBindings(editKeyBindings(onEdit, true), explicit);
}

export function textEditInputHandlers<TMessage>(
  onEdit: ((operation: TextEditOperation) => TMessage) | undefined
): {
  readonly onInput?: (text: string) => TMessage;
  readonly onPaste?: (text: string) => TMessage;
} {
  return onEdit === undefined
    ? {}
    : {
        onInput: (text) => onEdit({ kind: 'insert', text }),
        onPaste: (text) => onEdit({ kind: 'insert', text })
      };
}

export function numberInputKeyBindings<TMessage>(
  onAction: ((action: NumberInputAction) => TMessage) | undefined,
  explicit: ElementKeyBindings<TMessage> | undefined
): ElementKeyBindings<TMessage> | undefined {
  if (onAction === undefined) return explicit;
  const edits = editKeyBindings((operation) => onAction({ kind: 'edit', operation }), false);
  return mergeKeyBindings(mergeKeyBindings(edits, {
    arrowUp: () => onAction({ kind: 'step', direction: 'increment' }),
    arrowDown: () => onAction({ kind: 'step', direction: 'decrement' }),
    enter: () => onAction({ kind: 'commit' })
  }), explicit);
}

export function sliderKeyBindings<TMessage>(
  options: SliderOptions<TMessage>
): ElementKeyBindings<TMessage> | undefined {
  const step = options.step ?? 1;
  const min = options.min ?? 0;
  const max = options.max ?? 100;
  const decrement = options.onStep === undefined && options.onChange === undefined
    ? undefined
    : () => options.onStep?.({ direction: 'decrement' })
      ?? options.onChange?.(Math.max(min, options.value - step));
  const increment = options.onStep === undefined && options.onChange === undefined
    ? undefined
    : () => options.onStep?.({ direction: 'increment' })
      ?? options.onChange?.(Math.min(max, options.value + step));
  return mergeKeyBindings({
    ...(decrement === undefined ? {} : { arrowLeft: decrement, arrowDown: decrement }),
    ...(increment === undefined ? {} : { arrowRight: increment, arrowUp: increment })
  }, options.keys);
}

export function rangeSliderKeyBindings<TMessage>(
  options: RangeSliderOptions<TMessage>
): ElementKeyBindings<TMessage> | undefined {
  const step = options.step ?? 1;
  const min = options.range?.min ?? 0;
  const max = options.range?.max ?? 100;
  const { start, end } = options.value;
  const hasHandler = options.onStep !== undefined || options.onChange !== undefined;
  const decrementStart = hasHandler ? () => options.onStep?.({ handle: 'start', direction: 'decrement' })
    ?? options.onChange?.({ start: Math.max(min, start - step), end }) : undefined;
  const incrementStart = hasHandler ? () => options.onStep?.({ handle: 'start', direction: 'increment' })
    ?? options.onChange?.({ start: Math.min(end, start + step), end }) : undefined;
  const decrementEnd = hasHandler ? () => options.onStep?.({ handle: 'end', direction: 'decrement' })
    ?? options.onChange?.({ start, end: Math.max(start, end - step) }) : undefined;
  const incrementEnd = hasHandler ? () => options.onStep?.({ handle: 'end', direction: 'increment' })
    ?? options.onChange?.({ start, end: Math.min(max, end + step) }) : undefined;
  return mergeKeyBindings({
    ...(decrementStart === undefined ? {} : { arrowLeft: decrementStart }),
    ...(incrementStart === undefined ? {} : { arrowRight: incrementStart }),
    ...(decrementEnd === undefined ? {} : { arrowDown: decrementEnd }),
    ...(incrementEnd === undefined ? {} : { arrowUp: incrementEnd })
  }, options.keys);
}

export function checkboxGroupKeyBindings<TValue, TMessage>(
  options: CheckboxGroupOptions<TValue, TMessage>
): ElementKeyBindings<TMessage> | undefined {
  const action = options.onAction;
  const active = choiceFocus(options.options, options.focused, options.selected?.[0]);
  return mergeKeyBindings(action === undefined ? undefined : {
    arrowUp: () => action({ kind: 'move', delta: -1 }),
    arrowDown: () => action({ kind: 'move', delta: 1 }),
    home: () => action({ kind: 'first' }),
    end: () => action({ kind: 'last' }),
    ...(active === undefined ? {} : { enter: () => action({ kind: 'toggle', id: active }) })
  } satisfies ElementKeyBindings<TMessage>, options.keys);
}

export function radioGroupKeyBindings<TValue, TMessage>(
  options: RadioGroupOptions<TValue, TMessage>
): ElementKeyBindings<TMessage> | undefined {
  const action = options.onAction;
  const active = choiceFocus(options.options, options.focused, options.selected);
  return mergeKeyBindings(action === undefined ? undefined : {
    arrowUp: () => action({ kind: 'move', delta: -1 }),
    arrowDown: () => action({ kind: 'move', delta: 1 }),
    home: () => action({ kind: 'first' }),
    end: () => action({ kind: 'last' }),
    ...(active === undefined ? {} : { enter: () => action({ kind: 'select', id: active }) })
  } satisfies ElementKeyBindings<TMessage>, options.keys);
}

export function selectKeyBindings<TValue, TMessage>(
  options: SelectOptions<TValue, TMessage>
): ElementKeyBindings<TMessage> | undefined {
  const action = options.onAction;
  const active = choiceFocus(options.options, options.focused, options.selected);
  return mergeKeyBindings(action === undefined ? undefined : {
    arrowUp: () => action({ kind: 'move', delta: -1 }),
    arrowDown: () => action({ kind: 'move', delta: 1 }),
    home: () => action({ kind: 'first' }),
    end: () => action({ kind: 'last' }),
    ...(active === undefined ? {} : { enter: () => action({ kind: 'select', id: active }) })
  } satisfies ElementKeyBindings<TMessage>, options.keys);
}

export function colorSwatchPickerKeyBindings<TValue, TMessage>(
  options: ColorSwatchPickerOptions<TValue, TMessage>
): ElementKeyBindings<TMessage> | undefined {
  const action = options.onAction;
  const active = choiceFocus(options.options, options.focused, options.selected);
  const columns = Math.max(1, Math.floor(options.columns ?? 4));
  return mergeKeyBindings(action === undefined ? undefined : {
    arrowLeft: () => action({ kind: 'move', delta: -1 }),
    arrowRight: () => action({ kind: 'move', delta: 1 }),
    arrowUp: () => action({ kind: 'move', delta: -columns }),
    arrowDown: () => action({ kind: 'move', delta: columns }),
    home: () => action({ kind: 'first' }),
    end: () => action({ kind: 'last' }),
    ...(active === undefined ? {} : { enter: () => action({ kind: 'select', id: active }) })
  } satisfies ElementKeyBindings<TMessage>, options.keys);
}

export function menuKeyBindings<TMessage>(
  items: readonly MenuItem[],
  selected: string | undefined,
  onAction: ((action: MenuAction) => TMessage) | undefined,
  explicit: ElementKeyBindings<TMessage> | undefined
): ElementKeyBindings<TMessage> | undefined {
  if (onAction === undefined) return explicit;
  const active = selected ?? visibleMenuItems(items).find((item) => item.disabled !== true)?.id;
  return mergeKeyBindings({
    arrowUp: () => onAction({ kind: 'move', delta: -1 }),
    arrowDown: () => onAction({ kind: 'move', delta: 1 }),
    ...(active === undefined ? {} : {
      arrowLeft: () => onAction({ kind: 'collapse', id: active }),
      arrowRight: () => onAction({ kind: 'expand', id: active })
    }),
    home: () => onAction({ kind: 'first' }),
    end: () => onAction({ kind: 'last' }),
    ...(active === undefined ? {} : { enter: () => onAction({ kind: 'activate', id: active }) })
  }, explicit);
}

export function dropdownMenuKeyBindings<TMessage>(
  items: readonly MenuItem[],
  selected: string | undefined,
  highlighted: string | undefined,
  open: boolean,
  onAction: ((action: DropdownMenuAction) => TMessage) | undefined,
  explicit: ElementKeyBindings<TMessage> | undefined
): ElementKeyBindings<TMessage> | undefined {
  if (onAction === undefined) return explicit;
  const active = highlighted ?? selected ?? visibleMenuItems(items).find((item) => item.disabled !== true)?.id;
  return mergeKeyBindings({
    arrowUp: () => onAction({ kind: 'move', delta: -1 }),
    arrowDown: () => onAction({ kind: 'move', delta: 1 }),
    home: () => onAction({ kind: 'first' }),
    end: () => onAction({ kind: 'last' }),
    enter: () => open && active !== undefined
      ? onAction({ kind: 'activate', id: active })
      : onAction({ kind: 'open' }),
    ...(open ? { escape: () => onAction({ kind: 'close' }) } : {})
  }, explicit);
}

export function menuItemsForRenderer(items: readonly MenuItem[]): readonly RenderMenuItem[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    ...(item.description === undefined ? {} : { description: item.description }),
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    ...(item.shortcut === undefined ? {} : { shortcut: item.shortcut }),
    ...(item.tone === undefined ? {} : { tone: item.tone }),
    ...(item.checked === undefined ? {} : { checked: item.checked }),
    ...(item.expanded === undefined ? {} : { expanded: item.expanded }),
    ...(item.children === undefined ? {} : { children: menuItemsForRenderer(item.children) })
  }));
}

function visibleMenuItems(items: readonly MenuItem[]): readonly MenuItem[] {
  return items.flatMap((item): readonly MenuItem[] => [
    item,
    ...(item.expanded === true && item.children !== undefined ? visibleMenuItems(item.children) : [])
  ]);
}

function choiceFocus<TValue>(
  options: readonly import('../../ui-model/contracts.ts').ChoiceItem<TValue>[],
  focused: string | undefined,
  selected: string | undefined
): string | undefined {
  const enabled = options.filter((option) => option.disabled !== true);
  const candidate = focused ?? selected;
  return enabled.find((option) => option.id === candidate)?.id ?? enabled[0]?.id;
}

function editKeyBindings<TMessage>(
  onEdit: ((operation: TextEditOperation) => TMessage) | undefined,
  multiline: boolean
): ElementKeyBindings<TMessage> | undefined {
  if (onEdit === undefined) return undefined;
  return {
    ...(multiline ? { enter: () => onEdit({ kind: 'insert', text: '\n' }) } : {}),
    backspace: ({ input }) => onEdit(
      input.kind === 'key' && (input.ctrl || input.alt)
        ? { kind: 'deleteWordBackward' }
        : { kind: 'deleteBackward' }
    ),
    delete: ({ input }) => onEdit(
      input.kind === 'key' && (input.ctrl || input.alt)
        ? { kind: 'deleteWordForward' }
        : { kind: 'deleteForward' }
    ),
    arrowLeft: ({ input }) => onEdit(
      input.kind === 'key' && (input.ctrl || input.alt)
        ? { kind: 'moveWordLeft', select: input.shift }
        : { kind: 'moveLeft', select: input.kind === 'key' && input.shift }
    ),
    arrowRight: ({ input }) => onEdit(
      input.kind === 'key' && (input.ctrl || input.alt)
        ? { kind: 'moveWordRight', select: input.shift }
        : { kind: 'moveRight', select: input.kind === 'key' && input.shift }
    ),
    home: ({ input }) => onEdit({ kind: 'moveHome', select: input.kind === 'key' && input.shift }),
    end: ({ input }) => onEdit({ kind: 'moveEnd', select: input.kind === 'key' && input.shift }),
    ...(multiline
      ? {
          arrowUp: ({ input }) => onEdit({ kind: 'moveLineUp', select: input.kind === 'key' && input.shift }),
          arrowDown: ({ input }) => onEdit({ kind: 'moveLineDown', select: input.kind === 'key' && input.shift }),
          pageUp: ({ input }) => onEdit({ kind: 'movePageUp', select: input.kind === 'key' && input.shift }),
          pageDown: ({ input }) => onEdit({ kind: 'movePageDown', select: input.kind === 'key' && input.shift })
        }
      : {})
  };
}
