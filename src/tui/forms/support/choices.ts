import type { ChoiceItem } from '../../../components/contracts.ts';
import type { RenderNodeOfKind, RenderNodesOfKind } from '../../../render-node/index.ts';
import type { TerminalStyle } from '../../frame.ts';
import { resolveRenderNodeStyle } from '../../render-node-style.ts';
import { clean, isRecord } from './shared.ts';

type CheckboxListNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'checkboxList'>;
type ChoiceNode<TMessage = unknown> = RenderNodesOfKind<TMessage, 'radioGroup' | 'selectBox'>;
type ColorPickerNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'colorPicker'>;
type DatePickerNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'datePicker'>;
type ChoiceControlNode<TMessage = unknown> = CheckboxListNode<TMessage> | ChoiceNode<TMessage>;
type SelectableControlNode<TMessage = unknown> = ChoiceControlNode<TMessage> | ColorPickerNode<TMessage> | DatePickerNode<TMessage>;
type OptionStateNode<TMessage = unknown> = ChoiceControlNode<TMessage> | ColorPickerNode<TMessage>;

export function selectedId(widget: SelectableControlNode): string | undefined {
  const selected = widget.props.selected;
  return typeof selected === 'string' ? clean(selected) : undefined;
}

export function selectedOption(widget: ChoiceNode): ChoiceItem<unknown> | undefined {
  const selected = selectedId(widget);
  return selected === undefined ? undefined : formOptions(widget).find((option) => option.id === selected);
}

export function formOptions(widget: ChoiceControlNode): readonly ChoiceItem<unknown>[] {
  return widget.props.options.flatMap((option): readonly ChoiceItem<unknown>[] => sanitizeOption(option));
}

export function sanitizeOption(value: unknown): readonly ChoiceItem<unknown>[] {
  if (!isRecord(value)) return [];
  const id = value['id'];
  const label = value['label'];
  if (typeof id !== 'string' || typeof label !== 'string') return [];
  const description = value['description'];
  return [{
    id: clean(id),
    label: clean(label),
    value: value['value'],
    ...(value['disabled'] === true ? { disabled: true } : {}),
    ...(typeof description === 'string' ? { description: clean(description) } : {})
  }];
}

export function optionStyle(
  option: ChoiceItem<unknown>,
  widget: OptionStateNode
): TerminalStyle | undefined {
  if (option.disabled === true || widget.props.disabled === true) {
    return resolveRenderNodeStyle(widget, { part: 'option', state: 'disabled' });
  }
  return resolveRenderNodeStyle(widget, {
    part: 'option',
    ...(option.id === focusedId(widget)
      ? { state: 'focused' }
      : option.id === selectedId(widget)
        ? { state: 'selected' }
        : {})
  });
}

export function selectedIds(widget: CheckboxListNode): ReadonlySet<string> {
  return new Set(widget.props.selected?.map(clean) ?? []);
}

export function focusedId(widget: OptionStateNode): string | undefined {
  const focused = widget.props.focused;
  return typeof focused === 'string' ? clean(focused) : undefined;
}
