import type { Widget, WidgetOverflowPriority, WidgetTextRole } from './types.ts';
import {
  button,
  richText,
  text
} from './factories.ts';

export interface NavigationActionVisual<TMessage = never> {
  readonly id: string;
  readonly label: string;
  readonly message?: TMessage;
  readonly disabled?: boolean;
}

export interface NavigationButtonInput<TMessage = never> {
  readonly item: NavigationActionVisual<TMessage>;
  readonly id: string;
  readonly selected?: boolean;
  readonly primary?: boolean;
}

export function navigationButton<TMessage>(input: NavigationButtonInput<TMessage>): Widget<TMessage> {
  return button({
    id: input.id,
    label: input.item.label,
    ...(input.item.message === undefined ? {} : { message: input.item.message }),
    ...(input.item.disabled === undefined ? {} : { disabled: input.item.disabled }),
    ...(input.primary === true ? { tone: 'primary' as const } : input.selected === true ? { tone: 'secondary' as const } : {}),
    ...(input.selected === true ? { pressed: true } : {}),
    overflowPriority: input.selected === true ? 'important' : 'secondary'
  });
}

export function navigationText<TMessage>(
  value: string,
  options: {
    readonly id: string;
    readonly role?: WidgetTextRole;
    readonly overflowPriority?: WidgetOverflowPriority;
  }
): Widget<TMessage> {
  return text(value, {
    id: options.id,
    textRole: options.role ?? 'metadata',
    ...(options.overflowPriority === undefined ? {} : { overflowPriority: options.overflowPriority })
  });
}

export function navigationSeparator<TMessage>(value: string, id: string): Widget<TMessage> {
  return richText({
    id,
    segments: [{
      text: value,
      style: { fg: { kind: 'theme', token: 'surface.border' }, dim: true },
      source: { role: 'separator', kind: 'navigation', id }
    }],
    overflowPriority: 'decorative'
  });
}

export function navigationStatus<TMessage>(
  value: string,
  id: string,
  role: WidgetTextRole = 'metadata'
): Widget<TMessage> {
  return navigationText(value, {
    id,
    role,
    overflowPriority: role === 'metadata' || role === 'caption' ? 'secondary' : 'important'
  });
}
