import type { BorderStyle } from '../tui/border.ts';
import type { LayoutInsetInput } from '../tui/regions.ts';
import {
  absolute,
  field,
  inputField,
  modal,
  progressBar,
  stack,
  surface
} from './factories.ts';
import type {
  AccessibleNodeDefinition,
  Widget,
  WidgetChildren,
  WidgetInputMap,
  WidgetKeyMap
} from './types.ts';
import {
  dialogActionWidgets,
  dialogChildren,
  dialogMessageWidgets,
  dialogStepSummary
} from './dialog-visual.ts';

interface DialogOptions<TMessage> {
  readonly id?: string;
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
  readonly zIndex?: number;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface DialogAction<TMessage = never> {
  readonly id?: string;
  readonly label: string;
  readonly message: TMessage;
  readonly disabled?: boolean;
}

export interface MessageBoxOptions<TMessage = never> extends DialogOptions<TMessage> {
  readonly message: string | readonly string[];
  readonly actions?: readonly DialogAction<TMessage>[];
}

export interface ConfirmDialogOptions<TMessage = never> extends DialogOptions<TMessage> {
  readonly message: string | readonly string[];
  readonly confirmLabel?: string;
  readonly confirmMessage: TMessage;
  readonly cancelLabel?: string;
  readonly cancelMessage: TMessage;
}

export interface InputDialogOptions<TMessage = never> extends DialogOptions<TMessage> {
  readonly label: string;
  readonly value?: string;
  readonly description?: string;
  readonly inputMap?: WidgetInputMap<TMessage>;
  readonly submitLabel?: string;
  readonly submitMessage: TMessage;
  readonly cancelLabel?: string;
  readonly cancelMessage?: TMessage;
}

export interface WizardStep {
  readonly id: string;
  readonly label: string;
}

export interface WizardDialogOptions<TMessage = never> extends DialogOptions<TMessage> {
  readonly steps: readonly WizardStep[];
  readonly currentStep: number;
  readonly body: WidgetChildren<TMessage>;
  readonly actions?: readonly DialogAction<TMessage>[];
}

export interface FloatingWindowOptions<TMessage = never> {
  readonly id?: string;
  readonly title?: string;
  readonly body: WidgetChildren<TMessage>;
  readonly footer?: WidgetChildren<TMessage>;
  readonly row: number;
  readonly column: number;
  readonly width: number;
  readonly height: number;
  readonly active?: boolean;
  readonly zIndex?: number;
  readonly border?: BorderStyle;
  readonly padding?: LayoutInsetInput;
  readonly closeMessage?: TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export function messageBox<TMessage>(options: MessageBoxOptions<TMessage>): Widget<TMessage> {
  return modal(dialogBody([
    ...dialogMessageWidgets<TMessage>(options.message, childId(options.id, 'message')),
    ...dialogActionWidgets(options.actions, childId(options.id, 'actions'))
  ], options.id), modalOptions(options));
}

export function confirmDialog<TMessage>(options: ConfirmDialogOptions<TMessage>): Widget<TMessage> {
  return messageBox({
    ...options,
    actions: [
      {
        id: childId(options.id, 'cancel'),
        label: options.cancelLabel ?? 'Cancel',
        message: options.cancelMessage
      },
      {
        id: childId(options.id, 'confirm'),
        label: options.confirmLabel ?? 'Confirm',
        message: options.confirmMessage
      }
    ]
  });
}

export function inputDialog<TMessage>(options: InputDialogOptions<TMessage>): Widget<TMessage> {
  const actions: DialogAction<TMessage>[] = [
    ...(options.cancelMessage === undefined
      ? []
      : [{
          id: childId(options.id, 'cancel'),
          label: options.cancelLabel ?? 'Cancel',
          message: options.cancelMessage
        }]),
    {
      id: childId(options.id, 'submit'),
      label: options.submitLabel ?? 'Submit',
      message: options.submitMessage
    }
  ];
  return modal(dialogBody([
    field(inputField({
      id: childId(options.id, 'input'),
      ...(options.value === undefined ? {} : { value: options.value }),
      keyMap: { enter: options.submitMessage },
      ...(options.inputMap === undefined ? {} : { inputMap: options.inputMap })
    }), {
      id: childId(options.id, 'field'),
      label: options.label,
      ...(options.description === undefined ? {} : { description: options.description })
    }),
    ...dialogActionWidgets(actions, childId(options.id, 'actions'))
  ], options.id), modalOptions(options));
}

export function wizardDialog<TMessage>(options: WizardDialogOptions<TMessage>): Widget<TMessage> {
  const current = boundedStep(options.currentStep, options.steps.length);
  const step = options.steps[current];
  return modal(dialogBody([
    ...dialogStepSummary<TMessage>(options.steps, current, childId(options.id, 'steps')),
    progressBar({
      id: childId(options.id, 'progress'),
      label: step === undefined ? 'Step' : step.label,
      value: current + 1,
      max: Math.max(1, options.steps.length),
      mode: 'full',
      showPercentage: false
    }),
    ...dialogChildren(options.body),
    ...dialogActionWidgets(options.actions, childId(options.id, 'actions'))
  ], options.id), modalOptions(options));
}

export function floatingWindow<TMessage>(options: FloatingWindowOptions<TMessage>): Widget<TMessage> {
  const footer = [
    ...dialogChildren(options.footer),
    ...dialogActionWidgets(options.closeMessage === undefined
      ? []
      : [{
          id: childId(options.id, 'close'),
          label: 'Close',
          message: options.closeMessage
        }], childId(options.id, 'actions'))
  ];
  return absolute(surface(stack([
    ...dialogChildren(options.body),
    ...footer
  ], {
    id: childId(options.id, 'content'),
    gap: 1,
    padding: options.padding ?? 1
  }), {
    id: childId(options.id, 'surface'),
    variant: options.active === false ? 'base' : 'raised',
    border: options.border ?? {
      kind: options.active === false ? 'single' : 'double',
      ...(options.title === undefined ? {} : { title: options.title })
    },
    shadow: options.active !== false,
    opacity: 'opaque',
    ...(options.keyMap === undefined ? {} : { keyMap: options.keyMap }),
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility })
  }), {
    ...(options.id === undefined ? {} : { id: options.id }),
    row: options.row,
    column: options.column,
    width: options.width,
    height: options.height,
    ...(options.zIndex === undefined ? {} : { zIndex: options.zIndex })
  });
}

function dialogBody<TMessage>(children: readonly Widget<TMessage>[], id: string | undefined): Widget<TMessage> {
  return stack(children, {
    id: childId(id, 'body'),
    gap: 1,
    padding: 1
  });
}

function modalOptions<TMessage>(options: DialogOptions<TMessage>) {
  return {
    ...(options.id === undefined ? {} : { id: options.id }),
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.width === undefined ? {} : { width: options.width }),
    ...(options.height === undefined ? {} : { height: options.height }),
    ...(options.zIndex === undefined ? {} : { zIndex: options.zIndex }),
    ...(options.keyMap === undefined ? {} : { keyMap: options.keyMap }),
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility })
  };
}

function childId(id: string | undefined, suffix: string): string {
  return id === undefined ? suffix : `${id}:${suffix}`;
}

function boundedStep(currentStep: number, stepCount: number): number {
  return Math.max(0, Math.min(Math.max(0, stepCount - 1), Math.floor(currentStep)));
}
