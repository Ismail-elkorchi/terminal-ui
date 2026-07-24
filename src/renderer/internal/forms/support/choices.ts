import type { ChoiceItem } from '../../../../ui-model/contracts.ts';
import type { RenderNodeOfKind, RenderNodesOfKind } from '../../../model/index.ts';
import type { TerminalStyle } from '../../frame.ts';
import { resolveRenderNodeStyle } from '../../render-node-style.ts';
import { clean, isRecord } from './shared.ts';

type CheckboxGroupNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'checkboxGroup'>;
type ChoiceNode<TMessage = unknown> = RenderNodesOfKind<TMessage, 'radioGroup' | 'select'>;
type ColorSwatchPickerNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'colorSwatchPicker'>;
type CalendarNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'calendar'>;
type ChoiceControlNode<TMessage = unknown> = CheckboxGroupNode<TMessage> | ChoiceNode<TMessage>;
type SelectableControlNode<TMessage = unknown> = ChoiceControlNode<TMessage> | ColorSwatchPickerNode<TMessage> | CalendarNode<TMessage>;
type OptionStateNode<TMessage = unknown> = ChoiceControlNode<TMessage> | ColorSwatchPickerNode<TMessage>;

export function selectedId(renderNode: SelectableControlNode): string | undefined {
  const selected = renderNode.kind === 'select' ? renderNode.props.presentation.selected : renderNode.props.selected;
  return typeof selected === 'string' ? clean(selected) : undefined;
}

export function selectedOption(renderNode: ChoiceNode): ChoiceItem<unknown> | undefined {
  const selected = selectedId(renderNode);
  return selected === undefined ? undefined : formOptions(renderNode).find((option) => option.id === selected);
}

export function formOptions(renderNode: ChoiceControlNode): readonly ChoiceItem<unknown>[] {
  return renderNode.props.options.flatMap((option): readonly ChoiceItem<unknown>[] => sanitizeOption(option));
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
  renderNode: OptionStateNode
): TerminalStyle | undefined {
  if (option.disabled === true || renderNode.props.disabled === true) {
    return resolveRenderNodeStyle(renderNode, { part: 'option', state: 'disabled' });
  }
  return resolveRenderNodeStyle(renderNode, {
    part: 'option',
    ...(option.id === focusedId(renderNode)
      ? { state: 'focused' }
      : option.id === selectedId(renderNode)
        ? { state: 'selected' }
        : {})
  });
}

export function selectedIds(renderNode: CheckboxGroupNode): ReadonlySet<string> {
  return new Set(renderNode.props.selected?.map(clean) ?? []);
}

export function focusedId(renderNode: OptionStateNode): string | undefined {
  const focused = renderNode.kind === 'select'
    ? renderNode.props.presentation.kind === 'open' ? renderNode.props.presentation.highlighted : undefined
    : renderNode.props.focused;
  return typeof focused === 'string' ? clean(focused) : undefined;
}
