import type { AccessibleNodeDefinition } from '../options/base.ts';
import type {
  ComponentFocusOptions,
  ComponentKeyBindings,
  ComponentLayerOptions,
  ComponentMeta,
  ComponentStyleSlots
} from '../options/base.ts';
import type { ListOptions, TableColumn, TableOptions } from '../options/content.ts';
import type { RangeSliderOptions, SliderOptions } from '../options/forms.ts';
import type { MenuItem } from '../options/menus.ts';
import type { CommandBarAction } from '../command-bar.ts';
import type { PaletteAction } from '../palette.ts';
import type { TextEditOperation } from '../../text/index.ts';
import type { RenderNode } from '../../render-node/index.ts';
import type { RenderMenuItem } from '../../render-node/props/menus.ts';

export function listKeyBindings<TValue, TMessage>(
  options: ListOptions<TValue, TMessage>
): ComponentKeyBindings<TMessage> | undefined {
  const selectedItem = options.selected === undefined ? undefined : options.items[options.selected];
  const enterMessage = selectedItem === undefined || options.onSelect === undefined
    ? undefined
    : options.onSelect(selectedItem);
  return mergeKeyBindings(
    enterMessage === undefined ? undefined : { enter: enterMessage },
    options.keys
  );
}

export function tableKeyBindings<TRow, TMessage>(
  options: TableOptions<TRow, TMessage>
): ComponentKeyBindings<TMessage> | undefined {
  const selectedRow = options.selected === undefined ? undefined : options.rows[options.selected];
  const enterMessage = selectedRow === undefined || options.selected === undefined || options.onSelect === undefined
    ? undefined
    : options.onSelect({
        row: selectedRow,
        rowIndex: options.selected,
        ...(options.selectedCell?.column === undefined
          ? {}
          : {
              cell: {
                value: columnValue(selectedRow, options.selected, options.columns?.[options.selectedCell.column]),
                columnIndex: options.selectedCell.column,
                sourceColumnIndex: options.selectedCell.column,
                columnLabel: options.columns?.[options.selectedCell.column]?.header ?? `Column ${String(options.selectedCell.column + 1)}`
              }
            })
      });
  return mergeKeyBindings(enterMessage === undefined ? undefined : { enter: enterMessage }, options.keys);
}

export function activationKeyBindings<TMessage>(
  message: TMessage | undefined,
  explicit: ComponentKeyBindings<TMessage> | undefined
): ComponentKeyBindings<TMessage> | undefined {
  return mergeKeyBindings(message === undefined ? undefined : { enter: message }, explicit);
}

export function commandBarKeyBindings<TMessage>(
  onAction: (action: CommandBarAction) => TMessage
): ComponentKeyBindings<TMessage> {
  return {
    backspace: onAction({ kind: 'deleteBackward' }),
    delete: onAction({ kind: 'deleteForward' }),
    arrowLeft: onAction({ kind: 'moveLeft' }),
    arrowRight: onAction({ kind: 'moveRight' }),
    home: onAction({ kind: 'moveHome' }),
    end: onAction({ kind: 'moveEnd' })
  };
}

export function paletteKeyBindings<TMessage>(
  onAction: (action: PaletteAction) => TMessage
): ComponentKeyBindings<TMessage> {
  return {
    backspace: onAction({ kind: 'deleteQueryBackward' }),
    arrowUp: onAction({ kind: 'moveSelection', delta: -1 }),
    arrowDown: onAction({ kind: 'moveSelection', delta: 1 })
  };
}

export function textAreaKeyBindings<TMessage>(
  onEdit: ((operation: TextEditOperation) => TMessage) | undefined,
  explicit: ComponentKeyBindings<TMessage> | undefined
): ComponentKeyBindings<TMessage> | undefined {
  const generated = onEdit === undefined
    ? undefined
    : {
        enter: onEdit({ kind: 'insert', text: '\n' }),
        backspace: onEdit({ kind: 'deleteBackward' }),
        delete: onEdit({ kind: 'deleteForward' }),
        arrowLeft: onEdit({ kind: 'moveLeft' }),
        arrowRight: onEdit({ kind: 'moveRight' }),
        arrowUp: onEdit({ kind: 'moveLineUp' }),
        arrowDown: onEdit({ kind: 'moveLineDown' }),
        home: onEdit({ kind: 'moveHome' }),
        end: onEdit({ kind: 'moveEnd' }),
        pageUp: onEdit({ kind: 'movePageUp' }),
        pageDown: onEdit({ kind: 'movePageDown' })
      } satisfies ComponentKeyBindings<TMessage>;
  return mergeKeyBindings(generated, explicit);
}

export function sliderKeyBindings<TMessage>(
  options: SliderOptions<TMessage>
): ComponentKeyBindings<TMessage> | undefined {
  const step = options.step ?? 1;
  const min = options.min ?? 0;
  const max = options.max ?? 100;
  const decrement = options.onStep?.({ direction: 'decrement' })
    ?? options.onChange?.(Math.max(min, options.value - step));
  const increment = options.onStep?.({ direction: 'increment' })
    ?? options.onChange?.(Math.min(max, options.value + step));
  return mergeKeyBindings({
    ...(decrement === undefined ? {} : { arrowLeft: decrement, arrowDown: decrement }),
    ...(increment === undefined ? {} : { arrowRight: increment, arrowUp: increment })
  }, options.keys);
}

export function rangeSliderKeyBindings<TMessage>(
  options: RangeSliderOptions<TMessage>
): ComponentKeyBindings<TMessage> | undefined {
  const step = options.step ?? 1;
  const min = options.min ?? 0;
  const max = options.max ?? 100;
  const decrementStart = options.onStep?.({ handle: 'start', direction: 'decrement' })
    ?? options.onChange?.({ start: Math.max(min, options.start - step), end: options.end });
  const incrementStart = options.onStep?.({ handle: 'start', direction: 'increment' })
    ?? options.onChange?.({ start: Math.min(options.end, options.start + step), end: options.end });
  const decrementEnd = options.onStep?.({ handle: 'end', direction: 'decrement' })
    ?? options.onChange?.({ start: options.start, end: Math.max(options.start, options.end - step) });
  const incrementEnd = options.onStep?.({ handle: 'end', direction: 'increment' })
    ?? options.onChange?.({ start: options.start, end: Math.min(max, options.end + step) });
  return mergeKeyBindings({
    ...(decrementStart === undefined ? {} : { arrowLeft: decrementStart }),
    ...(incrementStart === undefined ? {} : { arrowRight: incrementStart }),
    ...(decrementEnd === undefined ? {} : { arrowDown: decrementEnd }),
    ...(incrementEnd === undefined ? {} : { arrowUp: incrementEnd })
  }, options.keys);
}

export function menuKeyBindings<TMessage>(
  items: readonly MenuItem<TMessage>[],
  selected: string | undefined,
  explicit: ComponentKeyBindings<TMessage> | undefined
): ComponentKeyBindings<TMessage> | undefined {
  const visible = visibleMenuItems(items);
  const item = selected === undefined
    ? visible.find((candidate) => candidate.disabled !== true)
    : visible.find((candidate) => candidate.id === selected);
  const message = item?.disabled === true ? undefined : item?.onPress;
  return activationKeyBindings(message, explicit);
}

export function menuItemsForRenderer<TMessage>(items: readonly MenuItem<TMessage>[]): readonly RenderMenuItem<TMessage>[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    ...(item.description === undefined ? {} : { description: item.description }),
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    ...(item.shortcut === undefined ? {} : { shortcut: item.shortcut }),
    ...(item.tone === undefined ? {} : { tone: item.tone }),
    ...(item.checked === undefined ? {} : { checked: item.checked }),
    ...(item.expanded === undefined ? {} : { expanded: item.expanded }),
    ...(item.onPress === undefined ? {} : { message: item.onPress }),
    ...(item.children === undefined ? {} : { children: menuItemsForRenderer(item.children) })
  }));
}

export function mergeKeyBindings<TMessage>(
  generated: ComponentKeyBindings<TMessage> | undefined,
  explicit: ComponentKeyBindings<TMessage> | undefined
): ComponentKeyBindings<TMessage> | undefined {
  const generatedText = generated?.text;
  const explicitText = explicit?.text;
  const mergedText = { ...(generatedText ?? {}), ...(explicitText ?? {}) };
  const merged: ComponentKeyBindings<TMessage> = {
    ...(generated ?? {}),
    ...(explicit ?? {}),
    ...(Object.keys(mergedText).length === 0 ? {} : { text: mergedText })
  };
  return Object.keys(merged).length === 0 ? undefined : merged;
}

export function interactionProps<TMessage>(options: {
  readonly keys?: ComponentKeyBindings<TMessage> | undefined;
  readonly onInput?: ((text: string) => TMessage) | undefined;
  readonly onPaste?: ((text: string) => TMessage) | undefined;
  readonly meta?: ComponentMeta | undefined;
}): {
  readonly layer?: ComponentLayerOptions;
  readonly focus?: ComponentFocusOptions;
  readonly styles?: ComponentStyleSlots;
  readonly keyMap?: ComponentKeyBindings<TMessage>;
  readonly inputMap?: NonNullable<RenderNode<TMessage>['inputMap']>;
  readonly accessibility?: AccessibleNodeDefinition;
} {
  const keyMap = normalizeKeyBindings(options.keys);
  const inputMap = inputMapFromHandlers(options);
  return {
    ...(options.meta?.layer === undefined ? {} : { layer: options.meta.layer }),
    ...(options.meta?.focus === undefined ? {} : { focus: options.meta.focus }),
    ...(options.meta?.styles === undefined ? {} : { styles: options.meta.styles }),
    ...(keyMap === undefined ? {} : { keyMap }),
    ...(inputMap === undefined ? {} : { inputMap }),
    ...(options.meta?.accessibility === undefined ? {} : { accessibility: options.meta.accessibility })
  };
}

export function withMetaDefaults(meta: ComponentMeta | undefined, defaults: ComponentMeta): ComponentMeta {
  const accessibility = meta?.accessibility ?? defaults.accessibility;
  const focus = mergeObject(defaults.focus, meta?.focus);
  const layer = mergeObject(defaults.layer, meta?.layer);
  const styles = mergeObject(defaults.styles, meta?.styles);
  return compactMeta({
    ...(accessibility === undefined ? {} : { accessibility }),
    ...(focus === undefined ? {} : { focus }),
    ...(layer === undefined ? {} : { layer }),
    ...(styles === undefined ? {} : { styles })
  }) ?? {};
}

function columnValue<TRow>(row: TRow, rowIndex: number, column: TableColumn<TRow> | undefined): unknown {
  return column?.value(row, rowIndex);
}

function visibleMenuItems<TMessage>(items: readonly MenuItem<TMessage>[]): readonly MenuItem<TMessage>[] {
  return items.flatMap((item): readonly MenuItem<TMessage>[] => [
    item,
    ...(item.expanded === true && item.children !== undefined ? visibleMenuItems(item.children) : [])
  ]);
}

function inputMapFromHandlers<TMessage>(options: {
  readonly onInput?: ((text: string) => TMessage) | undefined;
  readonly onPaste?: ((text: string) => TMessage) | undefined;
}): NonNullable<RenderNode<TMessage>['inputMap']> | undefined {
  if (options.onInput === undefined && options.onPaste === undefined) return undefined;
  return {
    ...(options.onInput === undefined ? {} : { text: options.onInput }),
    ...(options.onPaste === undefined ? {} : { paste: options.onPaste })
  };
}

function normalizeKeyBindings<TMessage>(
  keyMap: ComponentKeyBindings<TMessage> | undefined
): ComponentKeyBindings<TMessage> | undefined {
  return keyMap === undefined || Object.keys(keyMap).length === 0 ? undefined : keyMap;
}

function compactMeta(meta: ComponentMeta): ComponentMeta | undefined {
  const value: ComponentMeta = {
    ...(meta.accessibility === undefined ? {} : { accessibility: meta.accessibility }),
    ...(meta.focus === undefined ? {} : { focus: meta.focus }),
    ...(meta.layer === undefined ? {} : { layer: meta.layer }),
    ...(meta.styles === undefined ? {} : { styles: meta.styles })
  };
  return Object.keys(value).length === 0 ? undefined : value;
}

function mergeObject<T extends object>(defaults: T | undefined, current: T | undefined): T | undefined {
  if (defaults === undefined && current === undefined) return undefined;
  return {
    ...(defaults ?? {}),
    ...(current ?? {})
  } as T;
}
