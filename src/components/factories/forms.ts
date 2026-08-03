import { componentElementFromRenderNode } from '../../renderer/model/element.ts';
import type { Element, ElementChildren, ElementChildrenMessage } from '../../element/index.ts';
import type {
  ActiveTextInputOptions,
  ButtonOptions,
  CheckboxGroupOptions,
  CheckboxOptions,
  ColorSwatchPickerOptions,
  DisabledTextInputOptions,
  CalendarOptions,
  FieldOptions,
  FormOptions,
  LabelOptions,
  NumberInputOptions,
  PasswordInputOptions,
  RadioGroupOptions,
  RangeSliderOptions,
  SelectOptions,
  SliderOptions,
  TextInputOptions,
  ToggleSwitchOptions
} from '../options/forms.ts';
import type {
  ComponentKeyBindingMessages,
  IndependentInteractionOptions,
  InferredElementKeyBindings
} from '../internal/messages.ts';
import {
  activationKeyBindings,
  checkboxGroupKeyBindings,
  colorSwatchPickerKeyBindings,
  componentMetaProps,
  calendarKeyBindings,
  interactionProps,
  numberInputKeyBindings,
  radioGroupKeyBindings,
  rangeSliderKeyBindings,
  sliderKeyBindings,
  selectKeyBindings,
  textEditInputHandlers,
  textActionInputHandlers,
  textInputKeyBindings
} from '../internal/interaction.ts';
import {
  optionalRenderNodeId,
  requiredRenderNodeId,
  renderNodeChildren
} from '../../renderer/model/element.ts';
import { renderNodeLayoutProps } from '../../renderer/model/props/shared-layout.ts';
import { choiceItemsForRenderer, colorOptionsForRenderer } from '../internal/domain.ts';
import { normalizeInlineContent } from '../../visual/inline-content.ts';
import { selectPopupRenderNode } from '../internal/select-popup.ts';
import {
  assertNumericControlValue,
  validatedNumericControlRange
} from '../internal/numeric-controls.ts';
import {
  normalizeCheckboxGroupState,
  normalizeColorSwatchPickerState,
  normalizeRadioGroupState,
  normalizeSelectState
} from '../../behavior/choice-controls.ts';
import { segmentGraphemes, terminalTextWidth } from '../../text/index.ts';
import type { TextPointerAction } from '../../interaction/text-pointer.ts';
import { assertControlContract } from '../internal/control-contract.ts';

export function form<const TChildren extends ElementChildren>(
  children: TChildren,
  options: FormOptions = {}
): Element<ElementChildrenMessage<TChildren>> {
  type Message = ElementChildrenMessage<TChildren>;
  return componentElementFromRenderNode<'form', Message>({
    ...optionalRenderNodeId(options.id),
    kind: 'form',
    props: {
      ...(options.title === undefined ? {} : { title: options.title }),
      ...renderNodeLayoutProps(options)
    },
    children: renderNodeChildren(children),
    ...componentMetaProps(options.meta)
  });
}

export function field<const TChildren extends ElementChildren>(
  children: TChildren,
  options: FieldOptions
): Element<ElementChildrenMessage<TChildren>> {
  type Message = ElementChildrenMessage<TChildren>;
  return componentElementFromRenderNode<'field', Message>({
    ...optionalRenderNodeId(options.id),
    kind: 'field',
    props: {
      label: options.label,
      ...(options.description === undefined ? {} : { description: options.description }),
      ...renderNodeLayoutProps(options)
    },
    children: renderNodeChildren(children),
    ...componentMetaProps(options.meta)
  });
}

export function label(options: LabelOptions): Element {
  if (options.forId.length === 0) {
    throw new Error('label() requires a non-empty target control id.');
  }
  return componentElementFromRenderNode<'label'>({
    ...requiredRenderNodeId(options.id, 'label'),
    kind: 'label',
    props: {
      text: options.text,
      forId: options.forId
    },
    ...componentMetaProps(options.meta)
  });
}

export function button<
  const TPressMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  ButtonOptions,
  { readonly onPress: TPressMessage },
  TKeys,
  TPointerMessage
>): Element<TPressMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function button(options: unknown): Element<unknown> {
  return buttonElement(options as ButtonOptions<unknown>);
}

function buttonElement(options: ButtonOptions<unknown>): Element<unknown> {
  assertControlContract(
    'button',
    options,
    options.disabled === true,
    ['onPress']
  );
  const onPress = options.onPress;
  const keyMap = activationKeyBindings(
    onPress === undefined ? undefined : () => onPress(),
    options.keys
  );
  return componentElementFromRenderNode<'button', unknown>({
    ...requiredRenderNodeId(options.id, 'button'),
    kind: 'button',
    ...(options.disabled === true || options.busy === true
      ? { state: {
          ...(options.disabled === true ? { disabled: true } : {}),
          ...(options.busy === true ? { busy: true } : {})
        } }
      : {}),
    props: {
      label: options.label,
      ...(options.leading === undefined ? {} : { leading: normalizeInlineContent(options.leading) }),
      ...(options.trailing === undefined ? {} : { trailing: normalizeInlineContent(options.trailing) }),
      ...(onPress === undefined ? {} : { toPressMessage: onPress }),
      ...(options.tone === undefined ? {} : { tone: options.tone }),
      ...(options.density === undefined ? {} : { density: options.density })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function checkbox<const TMessage = never>(options: CheckboxOptions<TMessage>): Element<TMessage> {
  assertControlContract('checkbox', options, options.disabled === true, ['onChange']);
  const toMessage = options.onChange;
  const keyMap = activationKeyBindings(
    toMessage === undefined ? undefined : () => toMessage(!options.checked),
    options.keys
  );
  return componentElementFromRenderNode<'checkbox', TMessage>({
    ...requiredRenderNodeId(options.id, 'checkbox'),
    kind: 'checkbox',
    ...(options.disabled === true ? { state: { disabled: true } } : {}),
    props: {
      label: options.label,
      checked: options.checked,
      ...(toMessage === undefined ? {} : { toMessage }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function toggleSwitch<const TMessage = never>(options: ToggleSwitchOptions<TMessage>): Element<TMessage> {
  assertControlContract('toggleSwitch', options, options.disabled === true, ['onChange']);
  const toMessage = options.onChange;
  const keyMap = activationKeyBindings(
    toMessage === undefined ? undefined : () => toMessage(!options.checked),
    options.keys
  );
  return componentElementFromRenderNode<'toggleSwitch', TMessage>({
    ...requiredRenderNodeId(options.id, 'toggleSwitch'),
    kind: 'toggleSwitch',
    ...(options.disabled === true ? { state: { disabled: true } } : {}),
    props: {
      label: options.label,
      checked: options.checked,
      ...(options.onLabel === undefined ? {} : { onLabel: options.onLabel }),
      ...(options.offLabel === undefined ? {} : { offLabel: options.offLabel }),
      ...(toMessage === undefined ? {} : { toMessage }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function slider<const TMessage = never>(options: SliderOptions<TMessage>): Element<TMessage> {
  assertControlContract('slider', options, options.disabled === true, ['onChange']);
  const range = validatedNumericControlRange('slider', options);
  assertNumericControlValue('slider', options.value, range);
  const keyMap = sliderKeyBindings(options);
  return componentElementFromRenderNode<'slider', TMessage>({
    ...requiredRenderNodeId(options.id, 'slider'),
    kind: 'slider',
    ...(options.disabled === true ? { state: { disabled: true } } : {}),
    props: {
      label: options.label,
      value: options.value,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.step === undefined ? {} : { step: options.step }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.onChange === undefined ? {} : { toMessage: options.onChange }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function rangeSlider<const TMessage = never>(options: RangeSliderOptions<TMessage>): Element<TMessage> {
  assertControlContract('rangeSlider', options, options.disabled === true, ['onAction']);
  const range = validatedNumericControlRange('rangeSlider', {
    ...(options.range === undefined ? {} : { min: options.range.min, max: options.range.max }),
    ...(options.step === undefined ? {} : { step: options.step }),
    ...(options.width === undefined ? {} : { width: options.width })
  });
  assertNumericControlValue('rangeSlider', options.state.value.start, range);
  assertNumericControlValue('rangeSlider', options.state.value.end, range);
  if (options.state.value.start > options.state.value.end) {
    throw new RangeError('rangeSlider start value must be less than or equal to end value.');
  }
  const keyMap = rangeSliderKeyBindings(options);
  return componentElementFromRenderNode<'rangeSlider', TMessage>({
    ...requiredRenderNodeId(options.id, 'rangeSlider'),
    kind: 'rangeSlider',
    ...(options.disabled === true ? { state: { disabled: true } } : {}),
    props: {
      label: options.label,
      state: options.state,
      ...(options.range === undefined ? {} : { range: options.range }),
      ...(options.step === undefined ? {} : { step: options.step }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.onAction === undefined ? {} : { toActionMessage: options.onAction }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function checkboxGroup<TValue, const TMessage = never>(options: CheckboxGroupOptions<TValue, TMessage>): Element<TMessage> {
  assertControlContract('checkboxGroup', options, options.disabled === true, ['onAction']);
  const normalizedOptions = choiceItemsForRenderer(options.options);
  const presentation = normalizeCheckboxGroupState({
    selected: options.selected ?? [],
    ...(options.focused === undefined ? {} : { focused: options.focused })
  }, options.options);
  const keyMap = checkboxGroupKeyBindings(options);
  return componentElementFromRenderNode<'checkboxGroup', TMessage>({
    ...requiredRenderNodeId(options.id, 'checkboxGroup'),
    kind: 'checkboxGroup',
    ...(options.disabled === true ? { state: { disabled: true } } : {}),
    props: {
      options: normalizedOptions,
      label: options.label,
      ...(presentation.selected.length === 0 ? {} : { selected: presentation.selected }),
      ...(presentation.focused === undefined ? {} : { focused: presentation.focused }),
      ...(options.onAction === undefined ? {} : { toActionMessage: options.onAction }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function radioGroup<TValue, const TMessage = never>(options: RadioGroupOptions<TValue, TMessage>): Element<TMessage> {
  assertControlContract('radioGroup', options, options.disabled === true, ['onAction']);
  const normalizedOptions = choiceItemsForRenderer(options.options);
  const presentation = normalizeRadioGroupState({
    ...(options.selected === undefined ? {} : { selected: options.selected }),
    ...(options.focused === undefined ? {} : { focused: options.focused })
  }, options.options);
  const keyMap = radioGroupKeyBindings(options);
  return componentElementFromRenderNode<'radioGroup', TMessage>({
    ...requiredRenderNodeId(options.id, 'radioGroup'),
    kind: 'radioGroup',
    ...(options.disabled === true ? { state: { disabled: true } } : {}),
    props: {
      options: normalizedOptions,
      label: options.label,
      ...(presentation.selected === undefined ? {} : { selected: presentation.selected }),
      ...(presentation.focused === undefined ? {} : { focused: presentation.focused }),
      ...(options.onAction === undefined ? {} : { toActionMessage: options.onAction }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function colorSwatchPicker<TValue, const TMessage = never>(options: ColorSwatchPickerOptions<TValue, TMessage>): Element<TMessage> {
  assertControlContract('colorSwatchPicker', options, options.disabled === true, ['onAction']);
  const normalizedOptions = colorOptionsForRenderer(options.options);
  const presentation = normalizeColorSwatchPickerState({
    ...(options.selected === undefined ? {} : { selected: options.selected }),
    ...(options.focused === undefined ? {} : { focused: options.focused })
  }, options.options);
  const keyMap = colorSwatchPickerKeyBindings(options);
  return componentElementFromRenderNode<'colorSwatchPicker', TMessage>({
    ...requiredRenderNodeId(options.id, 'colorSwatchPicker'),
    kind: 'colorSwatchPicker',
    ...(options.disabled === true ? { state: { disabled: true } } : {}),
    props: {
      options: normalizedOptions,
      label: options.label,
      ...(presentation.selected === undefined ? {} : { selected: presentation.selected }),
      ...(presentation.focused === undefined ? {} : { focused: presentation.focused }),
      ...(options.columns === undefined ? {} : { columns: options.columns }),
      ...(options.onAction === undefined ? {} : { toActionMessage: options.onAction }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function calendar<
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  CalendarOptions,
  { readonly onAction: TActionMessage },
  TKeys,
  TPointerMessage
>): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function calendar(options: unknown): Element<unknown> {
  return calendarElement(options as CalendarOptions<unknown>);
}

function calendarElement(options: CalendarOptions<unknown>): Element<unknown> {
  assertControlContract('calendar', options, options.disabled === true, ['onAction']);
  const keyMap = calendarKeyBindings(options);
  const onAction = options.onAction;
  return componentElementFromRenderNode<'calendar', unknown>({
    ...requiredRenderNodeId(options.id, 'calendar'),
    kind: 'calendar',
    ...(options.disabled === true ? { state: { disabled: true } } : {}),
    props: {
      days: options.days,
      monthLabel: options.monthLabel,
      weekdays: options.weekdays,
      label: options.label,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.focused === undefined ? {} : { focused: options.focused }),
      ...(onAction === undefined ? {} : {
        toMessage: (day) => onAction({ kind: 'select', date: day.date }),
        toActionMessage: onAction
      }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function select<TValue, const TMessage = never>(options: SelectOptions<TValue, TMessage>): Element<TMessage> {
  assertControlContract('select', options, options.disabled === true, ['onAction']);
  const rawOptions = options as unknown as Readonly<Record<string, unknown>>;
  const rawPresentation = rawOptions['presentation'];
  if (
    rawOptions['disabled'] === true
    && typeof rawPresentation === 'object'
    && rawPresentation !== null
    && (rawPresentation as { readonly kind?: unknown }).kind === 'open'
  ) {
    throw new TypeError('select cannot be open while disabled.');
  }
  const keyMap = selectKeyBindings(options);
  const normalizedOptions = choiceItemsForRenderer(options.options);
  const presentation = normalizeSelectState(options.presentation, options.options);
  const onAction = options.onAction;
  const popup = presentation.kind === 'open'
    ? onAction === undefined
      ? undefined
      : selectPopupRenderNode({
        parentElementId: options.id,
        options: normalizedOptions,
        presentation,
        ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
        ...(options.meta?.styles === undefined ? {} : { styles: options.meta.styles }),
        toActionMessage: onAction
      })
    : undefined;
  return componentElementFromRenderNode<'select', TMessage>({
    ...requiredRenderNodeId(options.id, 'select'),
    kind: 'select',
    ...(options.disabled === true ? { state: { disabled: true } } : {}),
    props: {
      options: normalizedOptions,
      label: options.label,
      presentation,
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      maxVisibleOptions: selectVisibleOptionLimit(options.maxVisibleOptions),
      ...(onAction === undefined ? {} : { toActionMessage: onAction }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(popup === undefined ? {} : { children: [popup] }),
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

function selectVisibleOptionLimit(value: number | undefined): number {
  if (value === undefined) return 8;
  if (!Number.isFinite(value) || value < 1) {
    throw new RangeError('select maxVisibleOptions must be a positive finite number.');
  }
  return Math.max(1, Math.floor(value));
}

type ActionTextInputOptions = Extract<
  ActiveTextInputOptions<unknown>,
  { readonly onAction: unknown }
>;

type SubmitTextInputOptions = Extract<
  ActiveTextInputOptions<unknown>,
  { readonly onAction?: never }
>;

export function textInput<
  const TSubmitMessage = never,
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  ActionTextInputOptions,
  {
    readonly onAction: TActionMessage;
    readonly onSubmit: TSubmitMessage;
  },
  TKeys,
  TPointerMessage
>): Element<TSubmitMessage | TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function textInput<
  const TSubmitMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  SubmitTextInputOptions,
  { readonly onSubmit: TSubmitMessage },
  TKeys,
  TPointerMessage
>): Element<TSubmitMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function textInput(options: DisabledTextInputOptions): Element;
export function textInput(options: unknown): Element<unknown> {
  return textInputElement(options as TextInputOptions<unknown>);
}

function textInputElement(options: TextInputOptions<unknown>): Element<unknown> {
  assertControlContract(
    'textInput',
    options,
    options.disabled === true,
    [],
    ['onAction', 'onSubmit'],
    ['onAction', 'onSubmit']
  );
  const presentation = options.presentation;
  const keyMap = textInputKeyBindings(options.onAction, options.onSubmit, presentation.value, options.keys);
  return componentElementFromRenderNode<'textInput', unknown>({
    ...requiredRenderNodeId(options.id, 'textInput'),
    kind: 'textInput',
    ...(options.disabled === true ? { state: { disabled: true } } : {}),
    props: {
      value: presentation.value,
      cursor: presentation.cursor,
      ...(presentation.selection === undefined ? {} : { selection: presentation.selection }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.onAction === undefined ? {} : { toActionMessage: options.onAction }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({
      ...textActionInputHandlers(options.onAction),
      pointer: options.pointer,
      meta: options.meta
    })
  });
}

type ActionPasswordInputOptions = ActionTextInputOptions & {
  readonly mask?: string;
};

type SubmitPasswordInputOptions = SubmitTextInputOptions & {
  readonly mask?: string;
};

type DisabledPasswordInputOptions = DisabledTextInputOptions & {
  readonly mask?: string;
};

export function passwordInput<
  const TSubmitMessage = never,
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  ActionPasswordInputOptions,
  {
    readonly onAction: TActionMessage;
    readonly onSubmit: TSubmitMessage;
  },
  TKeys,
  TPointerMessage
>): Element<TSubmitMessage | TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function passwordInput<
  const TSubmitMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  SubmitPasswordInputOptions,
  { readonly onSubmit: TSubmitMessage },
  TKeys,
  TPointerMessage
>): Element<TSubmitMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function passwordInput(options: DisabledPasswordInputOptions): Element;
export function passwordInput(options: unknown): Element<unknown> {
  return passwordInputElement(options as PasswordInputOptions<unknown>);
}

function passwordInputElement(options: PasswordInputOptions<unknown>): Element<unknown> {
  assertControlContract(
    'passwordInput',
    options,
    options.disabled === true,
    [],
    ['onAction', 'onSubmit'],
    ['onAction', 'onSubmit']
  );
  const mask = passwordMask(options.mask);
  const sourceValue = options.presentation.value;
  const masked = maskedPasswordPresentation(options.presentation, mask);
  const onAction = options.onAction;
  const adaptedAction = onAction === undefined
    ? undefined
    : (action: import('../../ui-model/text-input.ts').TextInputAction) => onAction(
        action.kind === 'pointer'
          ? { kind: 'pointer', action: sourcePointerAction(sourceValue, action.action, mask.length) }
          : action
      );
  const keyMap = textInputKeyBindings(adaptedAction, options.onSubmit, sourceValue, options.keys);
  return componentElementFromRenderNode<'passwordInput', unknown>({
    ...requiredRenderNodeId(options.id, 'passwordInput'),
    kind: 'passwordInput',
    ...(options.disabled === true ? { state: { disabled: true } } : {}),
    props: {
      value: masked.value,
      cursor: masked.cursor,
      ...(masked.selection === undefined ? {} : { selection: masked.selection }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(adaptedAction === undefined ? {} : { toActionMessage: adaptedAction }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({
      ...textActionInputHandlers(adaptedAction),
      pointer: options.pointer,
      meta: options.meta
    })
  });
}

function passwordMask(value: string | undefined): string {
  const mask = value ?? '•';
  if (segmentGraphemes(mask).length !== 1 || terminalTextWidth(mask) !== 1) {
    throw new RangeError('passwordInput mask must be one printable one-cell grapheme.');
  }
  return mask;
}

function maskedPasswordPresentation(
  presentation: import('../../ui-model/text-input.ts').TextInputPresentation,
  mask: string
): import('../../ui-model/text-input.ts').TextInputPresentation {
  const segments = segmentGraphemes(presentation.value);
  return {
    value: mask.repeat(segments.length),
    cursor: maskedPasswordOffset(segments, presentation.cursor, mask.length),
    ...(presentation.selection === undefined ? {} : {
      selection: {
        startOffset: maskedPasswordOffset(segments, presentation.selection.startOffset, mask.length),
        endOffsetExclusive: maskedPasswordOffset(segments, presentation.selection.endOffsetExclusive, mask.length)
      }
    })
  };
}

function maskedPasswordOffset(
  segments: ReturnType<typeof segmentGraphemes>,
  sourceOffset: number,
  maskCodeUnits: number
): number {
  return segments.filter((segment) => segment.endOffsetExclusive <= sourceOffset).length * maskCodeUnits;
}

function sourcePasswordOffset(value: string, maskedOffset: number, maskCodeUnits: number): number {
  const segments = segmentGraphemes(value);
  const graphemeIndex = Math.max(0, Math.min(segments.length, Math.floor(maskedOffset / maskCodeUnits)));
  return graphemeIndex >= segments.length
    ? value.length
    : segments[graphemeIndex]?.startOffset ?? value.length;
}

function sourcePointerAction(
  value: string,
  action: TextPointerAction,
  maskCodeUnits: number
): TextPointerAction {
  const offset = sourcePasswordOffset(value, action.offset, maskCodeUnits);
  if (action.kind === 'placeCaret') return { kind: 'placeCaret', offset };
  return {
    kind: action.kind,
    anchor: sourcePasswordOffset(value, action.anchor, maskCodeUnits),
    offset
  };
}

export function numberInput<
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  NumberInputOptions,
  { readonly onAction: TActionMessage },
  TKeys,
  TPointerMessage
>): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function numberInput(options: unknown): Element<unknown> {
  return numberInputElement(options as NumberInputOptions<unknown>);
}

function numberInputElement(options: NumberInputOptions<unknown>): Element<unknown> {
  assertControlContract('numberInput', options, options.disabled === true, ['onAction']);
  const keyMap = numberInputKeyBindings(options.onAction, options.keys);
  const editHandlers = textEditInputHandlers(
    options.onAction === undefined
      ? undefined
      : (operation) => options.onAction({ kind: 'edit', operation })
  );
  return componentElementFromRenderNode<'numberInput', unknown>({
    ...requiredRenderNodeId(options.id, 'numberInput'),
    kind: 'numberInput',
    ...(options.disabled === true ? { state: { disabled: true } } : {}),
    props: {
      presentation: options.presentation,
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.error === undefined ? {} : { error: options.error }),
      ...(options.onAction === undefined ? {} : { toActionMessage: options.onAction })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ ...editHandlers, pointer: options.pointer, meta: options.meta })
  });
}
