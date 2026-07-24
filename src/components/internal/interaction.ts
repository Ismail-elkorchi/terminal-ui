import type { ElementKeyBindings } from '../../element/metadata.ts';
import type { ListOptions, PaginatorOptions, TableOptions, TreeOptions } from '../options/content.ts';
import type { ListCollection } from '../../ui-model/list.ts';
import type { NumberInputControlAction } from '../../ui-model/number-input.ts';
import type { RangeSliderOptions, SliderOptions } from '../options/forms.ts';
import type {
  CheckboxGroupOptions,
  ColorSwatchPickerOptions,
  RadioGroupOptions,
  SelectOptions
} from '../options/forms.ts';
import type { MenuItem } from '../options/menus.ts';
import type {
  ContextMenuAction,
  ContextMenuPresentation,
  DropdownMenuAction,
  DropdownMenuPresentation,
  MenuAction,
  MenuBarAction,
  MenuBarPresentation,
  MenuPresentation,
  MenuPresentationItem
} from '../../ui-model/menu.ts';
import type { CommandInputAction } from '../../ui-model/command-input.ts';
import type { PaletteAction } from '../../ui-model/palette.ts';
import type { TextEditOperation } from '../../text/index.ts';
import type { RenderMenuItem } from '../../renderer/model/props/menus.ts';
import { mergeKeyBindings } from '../../authoring/metadata.ts';
import { normalizeInlineContent } from '../../visual/inline-content.ts';
import { assertValidMenuItems } from '../../ui-model/menu.ts';
import type { TableCollection } from '../../ui-model/table.ts';
import { collectionRecordById } from '../../ui-model/collection.ts';

export {
  mergeKeyBindings,
  withMetaDefaults
} from '../../authoring/metadata.ts';
export {
  renderNodeInteraction as interactionProps,
  renderNodeMeta as componentMetaProps
} from '../../renderer/model/metadata.ts';

export function listKeyBindings<TValue, TMessage>(
  options: ListOptions<TValue, TMessage>,
  collection: ListCollection<TValue>
): ElementKeyBindings<TMessage> | undefined {
  const onAction = options.onAction;
  if (onAction === undefined) return options.keys;
  const selectedId = options.selectedId;
  const selectedIndex = selectedId === undefined
    ? -1
    : collectionRecordById(collection, selectedId)?.itemIndex ?? -1;
  const generated = {
    arrowUp: () => onAction({ kind: 'move', delta: -1 }),
    arrowDown: () => onAction({ kind: 'move', delta: 1 }),
    pageUp: () => onAction({ kind: 'page', delta: -1 }),
    pageDown: () => onAction({ kind: 'page', delta: 1 }),
    home: () => onAction({ kind: 'first' }),
    end: () => onAction({ kind: 'last' }),
    ...(selectedId === undefined || selectedIndex < 0 ? {} : {
      enter: () => onAction({ kind: 'activate', id: selectedId, itemIndex: selectedIndex })
    })
  } satisfies ElementKeyBindings<TMessage>;
  return mergeKeyBindings(generated, options.keys);
}

export function tableKeyBindings<TRow, TMessage>(
  options: TableOptions<TRow, TMessage>,
  collection: TableCollection<TRow>
): ElementKeyBindings<TMessage> | undefined {
  const onAction = options.onAction;
  if (onAction === undefined) return options.keys;
  const selectedRowId = options.presentation?.selectedRowId;
  const selectedRowIndex = selectedRowId === undefined
    ? -1
    : collectionRecordById(collection, selectedRowId)?.itemIndex ?? -1;
  const selectedColumn = options.presentation?.selectedCell?.columnIndex === undefined
    ? undefined
    : options.columns?.filter((column) => column.hidden !== true)[options.presentation.selectedCell.columnIndex];
  const generated = {
    arrowUp: () => onAction({ kind: 'moveRow', delta: -1 }),
    arrowDown: () => onAction({ kind: 'moveRow', delta: 1 }),
    arrowLeft: () => onAction({ kind: 'moveColumn', delta: -1 }),
    arrowRight: () => onAction({ kind: 'moveColumn', delta: 1 }),
    ...(selectedColumn?.resizable === true ? {
      triggers: [
        {
          trigger: { kind: 'key', key: 'arrowLeft', modifiers: { alt: true } },
          onKey: () => onAction({ kind: 'resizeColumnBy', columnId: selectedColumn.id, delta: -1 })
        },
        {
          trigger: { kind: 'key', key: 'arrowRight', modifiers: { alt: true } },
          onKey: () => onAction({ kind: 'resizeColumnBy', columnId: selectedColumn.id, delta: 1 })
        }
      ]
    } : {}),
    pageUp: () => onAction({ kind: 'page', delta: -1 }),
    pageDown: () => onAction({ kind: 'page', delta: 1 }),
    home: () => onAction({ kind: 'firstRow' }),
    end: () => onAction({ kind: 'lastRow' }),
    ...(selectedColumn?.sortable === true ? {
      space: () => onAction({ kind: 'sortBy', columnId: selectedColumn.id })
    } : {}),
    ...(selectedRowId === undefined || selectedRowIndex < 0 ? {} : {
      enter: () => onAction({
        kind: 'activate',
        rowId: selectedRowId,
        rowIndex: selectedRowIndex,
        ...(options.presentation?.selectedCell?.columnIndex === undefined
          ? {}
          : { columnIndex: options.presentation.selectedCell.columnIndex })
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
  handler: import('../../element/metadata.ts').ElementKeyHandler<TMessage> | undefined,
  explicit: ElementKeyBindings<TMessage> | undefined
): ElementKeyBindings<TMessage> | undefined {
  return mergeKeyBindings(handler === undefined ? undefined : { enter: handler }, explicit);
}

export function commandInputKeyBindings<TMessage>(
  onAction: (action: CommandInputAction) => TMessage
): ElementKeyBindings<TMessage> {
  const edit = (operation: TextEditOperation): TMessage => onAction({ kind: 'edit', operation });
  return {
    backspace: () => edit({ kind: 'deleteBackward' }),
    delete: () => edit({ kind: 'deleteForward' }),
    arrowLeft: () => edit({ kind: 'moveLeft' }),
    arrowRight: () => edit({ kind: 'moveRight' }),
    home: () => edit({ kind: 'moveHome' }),
    end: () => edit({ kind: 'moveEnd' })
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
  onAction: ((action: import('../../ui-model/text-input.ts').TextInputAction) => TMessage) | undefined,
  onSubmit: ((value: string) => TMessage) | undefined,
  value: string,
  explicit: ElementKeyBindings<TMessage> | undefined
): ElementKeyBindings<TMessage> | undefined {
  const generated = editKeyBindings(
    onAction === undefined ? undefined : (operation) => onAction({ kind: 'edit', operation }),
    false
  );
  return mergeKeyBindings(
    mergeKeyBindings(generated, onSubmit === undefined ? undefined : { enter: () => onSubmit(value) }),
    explicit
  );
}

export function textAreaKeyBindings<TMessage>(
  onAction: ((action: import('../../ui-model/text-area.ts').TextAreaControlAction) => TMessage) | undefined,
  explicit: ElementKeyBindings<TMessage> | undefined
): ElementKeyBindings<TMessage> | undefined {
  return mergeKeyBindings(editKeyBindings(
    onAction === undefined ? undefined : (operation) => onAction({ kind: 'edit', operation }),
    true
  ), explicit);
}

export function textActionInputHandlers<TMessage>(
  onAction: ((action: { readonly kind: 'edit'; readonly operation: TextEditOperation }) => TMessage) | undefined
): {
  readonly onInput?: (text: string) => TMessage;
  readonly onPaste?: (text: string) => TMessage;
} {
  return onAction === undefined
    ? {}
    : {
        onInput: (text) => onAction({ kind: 'edit', operation: { kind: 'insert', text } }),
        onPaste: (text) => onAction({ kind: 'edit', operation: { kind: 'insert', text } })
      };
}

export function textEditInputHandlers<TMessage>(
  toMessage: ((operation: TextEditOperation) => TMessage) | undefined
): {
  readonly onInput?: (text: string) => TMessage;
  readonly onPaste?: (text: string) => TMessage;
} {
  return toMessage === undefined
    ? {}
    : {
        onInput: (text) => toMessage({ kind: 'insert', text }),
        onPaste: (text) => toMessage({ kind: 'insert', text })
      };
}

export function numberInputKeyBindings<TMessage>(
  onAction: ((action: NumberInputControlAction) => TMessage) | undefined,
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
  const onStep = options.onStep;
  const onChange = options.onChange;
  const decrement = onStep !== undefined
    ? () => onStep({ direction: 'decrement' })
    : onChange !== undefined
      ? () => onChange(Math.max(min, options.value - step))
      : undefined;
  const increment = onStep !== undefined
    ? () => onStep({ direction: 'increment' })
    : onChange !== undefined
      ? () => onChange(Math.min(max, options.value + step))
      : undefined;
  return mergeKeyBindings({
    ...(decrement === undefined ? {} : { arrowLeft: decrement, arrowDown: decrement }),
    ...(increment === undefined ? {} : { arrowRight: increment, arrowUp: increment })
  }, options.keys);
}

export function rangeSliderKeyBindings<TMessage>(
  options: RangeSliderOptions<TMessage>
): ElementKeyBindings<TMessage> | undefined {
  const onAction = options.onAction;
  const decrement = onAction === undefined
    ? undefined
    : () => onAction({ kind: 'step', direction: 'decrement' });
  const increment = onAction === undefined
    ? undefined
    : () => onAction({ kind: 'step', direction: 'increment' });
  return mergeKeyBindings({
    ...(decrement === undefined ? {} : { arrowLeft: decrement }),
    ...(increment === undefined ? {} : { arrowRight: increment })
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
  const presentation = options.presentation;
  const active = presentation.kind === 'open' ? presentation.highlighted : undefined;
  return mergeKeyBindings(action === undefined ? undefined : {
    arrowUp: () => action({ kind: 'move', delta: -1 }),
    arrowDown: () => action({ kind: 'move', delta: 1 }),
    home: () => action({ kind: 'first' }),
    end: () => action({ kind: 'last' }),
    enter: () => active === undefined ? action({ kind: 'open' }) : action({ kind: 'commit', id: active }),
    space: () => active === undefined ? action({ kind: 'open' }) : action({ kind: 'commit', id: active }),
    ...(presentation.kind === 'open'
      ? { escape: () => action({ kind: 'dismiss', reason: 'escape' }) }
      : {})
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
  presentation: MenuPresentation,
  onAction: ((action: MenuAction) => TMessage) | undefined,
  explicit: ElementKeyBindings<TMessage> | undefined
): ElementKeyBindings<TMessage> | undefined {
  if (onAction === undefined) return explicit;
  const active = presentation.activePath.at(-1);
  return mergeKeyBindings({
    arrowUp: () => onAction({ kind: 'move', delta: -1 }),
    arrowDown: () => onAction({ kind: 'move', delta: 1 }),
    arrowLeft: () => onAction({ kind: 'back' }),
    arrowRight: () => onAction({ kind: 'enter' }),
    home: () => onAction({ kind: 'first' }),
    end: () => onAction({ kind: 'last' }),
    ...(active === undefined ? {} : { enter: () => onAction({ kind: 'activate', id: active }) })
  }, explicit);
}

export function menuBarKeyBindings<TMessage>(
  presentation: MenuBarPresentation,
  onAction: ((action: MenuBarAction) => TMessage) | undefined,
  explicit: ElementKeyBindings<TMessage> | undefined
): ElementKeyBindings<TMessage> | undefined {
  if (onAction === undefined) return explicit;
  const activeItem = presentation.kind === 'open' ? presentation.menu.activePath.at(-1) : undefined;
  return mergeKeyBindings({
    arrowLeft: () => onAction({ kind: 'moveHeading', delta: -1 }),
    arrowRight: () => onAction({ kind: 'moveHeading', delta: 1 }),
    arrowDown: () => presentation.kind === 'open'
      ? onAction({ kind: 'menu', action: { kind: 'move', delta: 1 } })
      : onAction({ kind: 'open', ...(presentation.active === undefined ? {} : { id: presentation.active }) }),
    ...(presentation.kind === 'open'
      ? {
          arrowUp: () => onAction({ kind: 'menu', action: { kind: 'move', delta: -1 } }),
          escape: () => onAction({ kind: 'close', reason: 'escape' })
        }
      : {}),
    home: () => onAction({ kind: 'firstHeading' }),
    end: () => onAction({ kind: 'lastHeading' }),
    enter: () => presentation.kind === 'open' && activeItem !== undefined
      ? onAction({ kind: 'menu', action: { kind: 'activate', id: activeItem } })
      : onAction({ kind: 'open', ...(presentation.active === undefined ? {} : { id: presentation.active }) })
  }, explicit);
}

export function contextMenuKeyBindings<TMessage>(
  presentation: ContextMenuPresentation,
  onAction: ((action: ContextMenuAction) => TMessage) | undefined,
  explicit: ElementKeyBindings<TMessage> | undefined
): ElementKeyBindings<TMessage> | undefined {
  if (onAction === undefined || presentation.kind === 'closed') return explicit;
  const menuBindings = menuKeyBindings(
    presentation.menu,
    (action) => onAction({ kind: 'menu', action }),
    undefined
  );
  return mergeKeyBindings({
    ...menuBindings,
    escape: () => onAction({ kind: 'dismiss', reason: 'escape' })
  }, explicit);
}

export function dropdownMenuKeyBindings<TMessage>(
  presentation: DropdownMenuPresentation,
  onAction: ((action: DropdownMenuAction) => TMessage) | undefined,
  explicit: ElementKeyBindings<TMessage> | undefined
): ElementKeyBindings<TMessage> | undefined {
  if (onAction === undefined) return explicit;
  const active = presentation.kind === 'open' ? presentation.menu.activePath.at(-1) : undefined;
  return mergeKeyBindings({
    arrowUp: () => presentation.kind === 'open'
      ? onAction({ kind: 'menu', action: { kind: 'move', delta: -1 } })
      : onAction({ kind: 'open' }),
    arrowDown: () => presentation.kind === 'open'
      ? onAction({ kind: 'menu', action: { kind: 'move', delta: 1 } })
      : onAction({ kind: 'open' }),
    home: () => presentation.kind === 'open'
      ? onAction({ kind: 'menu', action: { kind: 'first' } })
      : onAction({ kind: 'open' }),
    end: () => presentation.kind === 'open'
      ? onAction({ kind: 'menu', action: { kind: 'last' } })
      : onAction({ kind: 'open' }),
    enter: () => presentation.kind === 'open' && active !== undefined
      ? onAction({ kind: 'menu', action: { kind: 'activate', id: active } })
      : onAction({ kind: 'open' }),
    ...(presentation.kind === 'open'
      ? { escape: () => onAction({ kind: 'dismiss', reason: 'escape' }) }
      : {})
  }, explicit);
}

export function menuItemsForRenderer(items: readonly (MenuItem | MenuPresentationItem)[]): readonly RenderMenuItem[] {
  assertValidMenuItems(items);
  return projectMenuItemsForRenderer(items);
}

function projectMenuItemsForRenderer(items: readonly (MenuItem | MenuPresentationItem)[]): readonly RenderMenuItem[] {
  return items.map((item): RenderMenuItem => {
    const common = {
      id: item.id,
      label: item.label,
      ...(item.leading === undefined ? {} : { leading: normalizeInlineContent(item.leading) }),
      ...(item.trailing === undefined ? {} : { trailing: normalizeInlineContent(item.trailing) }),
      ...(item.description === undefined ? {} : { description: item.description }),
      ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
      ...(item.shortcut === undefined ? {} : { shortcut: item.shortcut }),
      ...(item.tone === undefined ? {} : { tone: item.tone })
    };
    switch (item.kind) {
      case 'action': return { ...common, kind: 'action' };
      case 'check': return { ...common, kind: 'check', checked: item.checked };
      case 'submenu': return {
        ...common,
        kind: 'submenu',
        ...('expanded' in item && item.expanded ? { expanded: true } : {}),
        children: projectMenuItemsForRenderer(item.children)
      };
    }
  });
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
  toMessage: ((operation: TextEditOperation) => TMessage) | undefined,
  multiline: boolean
): ElementKeyBindings<TMessage> | undefined {
  if (toMessage === undefined) return undefined;
  return {
    ...(multiline ? { enter: () => toMessage({ kind: 'insert', text: '\n' }) } : {}),
    backspace: ({ input }) => toMessage(
      input.kind === 'key' && (input.modifiers.ctrl || input.modifiers.alt)
        ? { kind: 'deleteWordBackward' }
        : { kind: 'deleteBackward' }
    ),
    delete: ({ input }) => toMessage(
      input.kind === 'key' && (input.modifiers.ctrl || input.modifiers.alt)
        ? { kind: 'deleteWordForward' }
        : { kind: 'deleteForward' }
    ),
    arrowLeft: ({ input }) => toMessage(
      input.kind === 'key' && (input.modifiers.ctrl || input.modifiers.alt)
        ? { kind: 'moveWordLeft', select: input.modifiers.shift }
        : { kind: 'moveLeft', select: input.kind === 'key' && input.modifiers.shift }
    ),
    arrowRight: ({ input }) => toMessage(
      input.kind === 'key' && (input.modifiers.ctrl || input.modifiers.alt)
        ? { kind: 'moveWordRight', select: input.modifiers.shift }
        : { kind: 'moveRight', select: input.kind === 'key' && input.modifiers.shift }
    ),
    home: ({ input }) => toMessage({ kind: 'moveHome', select: input.kind === 'key' && input.modifiers.shift }),
    end: ({ input }) => toMessage({ kind: 'moveEnd', select: input.kind === 'key' && input.modifiers.shift }),
    ...(multiline
      ? {
          arrowUp: ({ input }) => toMessage({ kind: 'moveLineUp', select: input.kind === 'key' && input.modifiers.shift }),
          arrowDown: ({ input }) => toMessage({ kind: 'moveLineDown', select: input.kind === 'key' && input.modifiers.shift }),
          pageUp: ({ input }) => toMessage({ kind: 'movePageUp', select: input.kind === 'key' && input.modifiers.shift }),
          pageDown: ({ input }) => toMessage({ kind: 'movePageDown', select: input.kind === 'key' && input.modifiers.shift })
        }
      : {})
  };
}
