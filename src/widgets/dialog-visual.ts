import {
  button,
  row,
  text
} from './factories.ts';
import type { Widget, WidgetChildren } from './types.ts';

export interface DialogVisualAction<TMessage = never> {
  readonly id?: string;
  readonly label: string;
  readonly message: TMessage;
  readonly disabled?: boolean;
}

export interface DialogStepVisual {
  readonly id: string;
  readonly label: string;
}

export function dialogMessageWidgets<TMessage>(
  message: string | readonly string[],
  id: string
): readonly Widget<TMessage>[] {
  const lines = typeof message === 'string' ? message.split('\n') : message;
  return lines.map((line, index) => text(line, {
    id: `${id}:${String(index)}`,
    textRole: index === 0 ? 'body' : 'caption',
    overflowPriority: index === 0 ? 'important' : 'secondary'
  }));
}

export function dialogActionWidgets<TMessage>(
  actions: readonly DialogVisualAction<TMessage>[] | undefined,
  id: string
): readonly Widget<TMessage>[] {
  if (actions === undefined || actions.length === 0) return [];
  const lastEnabledIndex = lastEnabledActionIndex(actions);
  return [row<TMessage>(actions.map((action, index) =>
    button({
      ...(action.id === undefined ? {} : { id: action.id }),
      label: action.label,
      message: action.message,
      ...(action.disabled === undefined ? {} : { disabled: action.disabled }),
      tone: index === lastEnabledIndex ? 'primary' : 'secondary'
    })
  ), {
    id,
    gap: 1,
    align: 'end',
    overflowPriority: 'important'
  })];
}

export function dialogStepSummary<TMessage>(
  steps: readonly DialogStepVisual[],
  currentStep: number,
  id: string
): readonly Widget<TMessage>[] {
  if (steps.length === 0) return [];
  return [row<TMessage>(steps.map((step, index) => {
    const role = index < currentStep ? 'success' : index === currentStep ? 'badge' : 'metadata';
    const marker = index < currentStep ? '✓' : index === currentStep ? '●' : '○';
    return text(`${marker} ${step.label}`, {
      id: `${id}:${step.id}`,
      textRole: role,
      overflowPriority: index === currentStep ? 'important' : 'secondary'
    });
  }), {
    id,
    gap: 1,
    overflowPriority: 'important'
  })];
}

export function dialogChildren<TMessage>(children: WidgetChildren<TMessage> | undefined): readonly Widget<TMessage>[] {
  if (children === undefined) return [];
  return Array.isArray(children) ? [...children as readonly Widget<TMessage>[]] : [children as Widget<TMessage>];
}

function lastEnabledActionIndex<TMessage>(actions: readonly DialogVisualAction<TMessage>[]): number {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    if (actions[index]?.disabled !== true) return index;
  }
  return Math.max(0, actions.length - 1);
}
